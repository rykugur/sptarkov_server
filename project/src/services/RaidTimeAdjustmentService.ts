import { inject, injectable } from "tsyringe";

import { ApplicationContext } from "@spt-aki/context/ApplicationContext";
import { ContextVariableType } from "@spt-aki/context/ContextVariableType";
import { WeightedRandomHelper } from "@spt-aki/helpers/WeightedRandomHelper";
import { ILocationBase } from "@spt-aki/models/eft/common/ILocationBase";
import { IGetRaidTimeRequest } from "@spt-aki/models/eft/game/IGetRaidTimeRequest";
import { ExtractChange, IGetRaidTimeResponse } from "@spt-aki/models/eft/game/IGetRaidTimeResponse";
import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ILocationConfig, LootMultiplier } from "@spt-aki/models/spt/config/ILocationConfig";
import { IRaidChanges } from "@spt-aki/models/spt/location/IRaidChanges";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

@injectable()
export class RaidTimeAdjustmentService
{
    protected locationConfig: ILocationConfig;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.locationConfig = this.configServer.getConfig(ConfigTypes.LOCATION);
    }

    /**
     * Make alterations to the base map data passed in
     * Loot multipliers/waves/wave start times
     * @param raidAdjustments Changes to process on map
     * @param mapBase Map to adjust
     */
    public makeAdjustmentsToMap(raidAdjustments: IRaidChanges, mapBase: ILocationBase): void
    {
        this.logger.debug(`Adjusting dynamic loot multipliers to ${raidAdjustments.dynamicLootPercent}% and static loot multipliers to ${raidAdjustments.staticLootPercent}% of original`);

        // Change loot multipler values before they're used below
        this.adjustLootMultipliers(this.locationConfig.looseLootMultiplier, raidAdjustments.dynamicLootPercent);
        this.adjustLootMultipliers(this.locationConfig.staticLootMultiplier, raidAdjustments.staticLootPercent);

        // Make alterations to bot spawn waves now player is simulated spawning later
        this.adjustWaves(mapBase, raidAdjustments)
    }

    /**
     * Adjust the loot multiplier values passed in to be a % of their original value
     * @param mapLootMultiplers Multiplers to adjust
     * @param loosePercent Percent to change values to
     */
    protected adjustLootMultipliers(mapLootMultiplers: LootMultiplier, loosePercent: number): void
    {
        for (const key in mapLootMultiplers)
        {
            mapLootMultiplers[key] = this.randomUtil.getPercentOfValue(mapLootMultiplers[key], loosePercent);
        }
    }

    /**
     * Adjust bot waves to act as if player spawned later
     * @param mapBase map to adjust
     * @param raidAdjustments Map adjustments
     */
    protected adjustWaves(mapBase: ILocationBase, raidAdjustments: IRaidChanges): void
    {
        // Remove waves that spawned before the player joined
        const originalWaveCount = mapBase.waves.length;
        mapBase.waves = mapBase.waves.filter(x => x.time_max > raidAdjustments.simulatedRaidStartSeconds);

        // Adjust wave min/max times to match new simulated start
        for (const wave of mapBase.waves)
        {
            wave.time_min -= raidAdjustments.simulatedRaidStartSeconds;
            wave.time_max -= raidAdjustments.simulatedRaidStartSeconds;
        }

        this.logger.debug(`Removed ${originalWaveCount - mapBase.waves.length} wave from map due to simulated raid start time of ${raidAdjustments.simulatedRaidStartSeconds / 60} minutes`);
    }

    /**
     * Create a randomised adjustment to the raid based on map data in location.json
     * @param sessionId Session id
     * @param request Raid adjustment request
     * @returns Response to send to client
     */
    public getRaidAdjustments(sessionId: string, request: IGetRaidTimeRequest): IGetRaidTimeResponse
    {
        const db = this.databaseServer.getTables()

        const mapBase: ILocationBase = db.locations[request.Location.toLowerCase()].base;
        const baseEscapeTimeMinutes = mapBase.EscapeTimeLimit;

        // Prep result object to return
        const result: IGetRaidTimeResponse = {
            RaidTimeMinutes: baseEscapeTimeMinutes,
            ExitChanges: [],
            NewSurviveTimeSeconds: null,
            OriginalSurvivalTimeSeconds: db.globals.config.exp.match_end.survived_seconds_requirement
        }

        // Pmc raid, send default
        if (request.Side.toLowerCase() === "pmc")
        {
            return result;
        }

        // We're scav adjust values
        let mapSettings = this.locationConfig.scavRaidTimeSettings[request.Location.toLowerCase()];
        if (!mapSettings)
        {
            this.logger.warning(`Unable to find scav raid time settings for map: ${request.Location}, using defaults`);
            mapSettings = this.locationConfig.scavRaidTimeSettings.default;
        }

        // Chance of reducing raid time for scav, not guaranteed
        if (!this.randomUtil.getChance100(mapSettings.reducedChancePercent))
        {
            // Send default
            return result;
        }
        
        // Get the weighted percent to reduce the raid time by
        const chosenRaidReductionPercent = Number.parseInt(this.weightedRandomHelper.getWeightedValue<string>(
            mapSettings.reductionPercentWeights,
        ));

        // How many minutes raid will last
        const newRaidTimeMinutes = Math.floor(this.randomUtil.reduceValueByPercent(baseEscapeTimeMinutes, chosenRaidReductionPercent));

        // Time player spawns into the raid if it was online
        const simulatedRaidStartTimeMinutes = baseEscapeTimeMinutes - newRaidTimeMinutes;

        if (mapSettings.reduceLootByPercent)
        {
            // Store time reduction percent in app context so loot gen can pick it up later
            this.applicationContext.addValue(ContextVariableType.RAID_ADJUSTMENTS, 
                {
                    dynamicLootPercent: Math.max(chosenRaidReductionPercent, mapSettings.minDynamicLootPercent),
                    staticLootPercent: Math.max(chosenRaidReductionPercent, mapSettings.minStaticLootPercent),
                    simulatedRaidStartSeconds: simulatedRaidStartTimeMinutes * 60
                });
        }
        
        // Update result object with new time
        result.RaidTimeMinutes = newRaidTimeMinutes;

        this.logger.debug(`Reduced: ${request.Location} raid time by: ${chosenRaidReductionPercent}% to ${newRaidTimeMinutes} minutes`)

        // Calculate how long player needs to be in raid to get a `survived` extract status
        result.NewSurviveTimeSeconds = Math.max(result.OriginalSurvivalTimeSeconds - ((baseEscapeTimeMinutes - newRaidTimeMinutes) * 60), 0);

        const exitAdjustments = this.getExitAdjustments(mapBase, newRaidTimeMinutes);
        if (exitAdjustments)
        {
            result.ExitChanges.push(...exitAdjustments);
        }

        return result;
    }

    /**
     * Adjust exit times to handle scavs entering raids part-way through
     * @param mapBase Map base file player is on
     * @param newRaidTimeMinutes How long raid is in minutes
     * @returns List of  exit changes to send to client
     */
        protected getExitAdjustments(mapBase: ILocationBase, newRaidTimeMinutes: number): ExtractChange[]
        {
            const result = [];
            // Adjust train exits only
            for (const exit of mapBase.exits)
            {
                if (exit.PassageRequirement !== "Train")
                {
                    continue;
                }
    
                // Prepare train adjustment object
                const exitChange: ExtractChange = {
                    Name: exit.Name,
                    MinTime: null,
                    MaxTime: null,
                    Chance: null
                }
    
                // If raid is after last moment train can leave, assume train has already left, disable extract
                const latestPossibleDepartureMinutes = (exit.MaxTime + exit.Count) / 60;
                if (newRaidTimeMinutes < latestPossibleDepartureMinutes)
                {
                    exitChange.Chance = 0;
    
                    this.logger.debug(`Train Exit: ${exit.Name} disabled as new raid time ${newRaidTimeMinutes} minutes is below ${latestPossibleDepartureMinutes} minutes`);
    
                    result.push(exitChange);
    
                    continue;
                }
    
                // What minute we simulate the player joining a raid at
                const simulatedRaidEntryTimeMinutes = mapBase.EscapeTimeLimit - newRaidTimeMinutes;
    
                // How many seconds to reduce extract arrival times by, negative values seem to make extract turn red in game
                const reductionSeconds = simulatedRaidEntryTimeMinutes * 60;
    
                exitChange.MinTime = exit.MinTime - reductionSeconds;
                exitChange.MaxTime = exit.MaxTime - reductionSeconds;
    
                this.logger.debug(`Train appears between: ${exitChange.MinTime} and ${exitChange.MaxTime} seconds raid time`);
                
                result.push(exitChange);
            }
    
            return result.length > 0
                ? result
                : null ;
        }
}
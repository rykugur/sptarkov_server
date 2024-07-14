import { inject, injectable } from "tsyringe";
import { RagfairOfferGenerator } from "@spt/generators/RagfairOfferGenerator";
import { HandbookHelper } from "@spt/helpers/HandbookHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { RagfairHelper } from "@spt/helpers/RagfairHelper";
import { RagfairOfferHelper } from "@spt/helpers/RagfairOfferHelper";
import { RagfairSellHelper } from "@spt/helpers/RagfairSellHelper";
import { RagfairSortHelper } from "@spt/helpers/RagfairSortHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { IBarterScheme, ITraderAssort } from "@spt/models/eft/common/tables/ITrader";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { IAddOfferRequestData, Requirement } from "@spt/models/eft/ragfair/IAddOfferRequestData";
import { IExtendOfferRequestData } from "@spt/models/eft/ragfair/IExtendOfferRequestData";
import { IGetItemPriceResult } from "@spt/models/eft/ragfair/IGetItemPriceResult";
import { IGetMarketPriceRequestData } from "@spt/models/eft/ragfair/IGetMarketPriceRequestData";
import { IGetOffersResult } from "@spt/models/eft/ragfair/IGetOffersResult";
import { IGetRagfairOfferByIdRequest } from "@spt/models/eft/ragfair/IGetRagfairOfferByIdRequest";
import { IRagfairOffer } from "@spt/models/eft/ragfair/IRagfairOffer";
import { IRemoveOfferRequestData } from "@spt/models/eft/ragfair/IRemoveOfferRequestData";
import { ISearchRequestData } from "@spt/models/eft/ragfair/ISearchRequestData";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { FleaOfferType } from "@spt/models/enums/FleaOfferType";
import { MemberCategory } from "@spt/models/enums/MemberCategory";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { RagfairServer } from "@spt/servers/RagfairServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PaymentService } from "@spt/services/PaymentService";
import { RagfairOfferService } from "@spt/services/RagfairOfferService";
import { RagfairPriceService } from "@spt/services/RagfairPriceService";
import { RagfairRequiredItemsService } from "@spt/services/RagfairRequiredItemsService";
import { RagfairTaxService } from "@spt/services/RagfairTaxService";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";

/**
 * Handle RagfairCallback events
 */
@injectable()
export class RagfairController
{
    protected ragfairConfig: IRagfairConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("RagfairServer") protected ragfairServer: RagfairServer,
        @inject("RagfairPriceService") protected ragfairPriceService: RagfairPriceService,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("RagfairSellHelper") protected ragfairSellHelper: RagfairSellHelper,
        @inject("RagfairTaxService") protected ragfairTaxService: RagfairTaxService,
        @inject("RagfairSortHelper") protected ragfairSortHelper: RagfairSortHelper,
        @inject("RagfairOfferHelper") protected ragfairOfferHelper: RagfairOfferHelper,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("HandbookHelper") protected handbookHelper: HandbookHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("RagfairHelper") protected ragfairHelper: RagfairHelper,
        @inject("RagfairOfferService") protected ragfairOfferService: RagfairOfferService,
        @inject("RagfairRequiredItemsService") protected ragfairRequiredItemsService: RagfairRequiredItemsService,
        @inject("RagfairOfferGenerator") protected ragfairOfferGenerator: RagfairOfferGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
    )
    {
        this.ragfairConfig = this.configServer.getConfig(ConfigTypes.RAGFAIR);
    }

    /**
     * Handles client/ragfair/find
     * Returns flea offers that match required search parameters
     * @param sessionID Player id
     * @param searchRequest Search request data
     * @returns IGetOffersResult
     */
    public getOffers(sessionID: string, searchRequest: ISearchRequestData): IGetOffersResult
    {
        const profile = this.profileHelper.getFullProfile(sessionID);

        const itemsToAdd = this.ragfairHelper.filterCategories(sessionID, searchRequest);
        const traderAssorts = this.ragfairHelper.getDisplayableAssorts(sessionID);
        const result: IGetOffersResult = {
            offers: [],
            offersCount: searchRequest.limit,
            selectedCategory: searchRequest.handbookId,
        };

        result.offers = this.getOffersForSearchType(searchRequest, itemsToAdd, traderAssorts, profile.characters.pmc);

        // Client requested a category refresh
        if (searchRequest.updateOfferCount)
        {
            result.categories = this.getSpecificCategories(profile.characters.pmc, searchRequest, result.offers);
        }

        this.addIndexValueToOffers(result.offers);

        // Sort offers
        result.offers = this.ragfairSortHelper.sortOffers(
            result.offers,
            searchRequest.sortType,
            searchRequest.sortDirection,
        );

        // Match offers with quests and lock unfinished quests
        for (const offer of result.offers)
        {
            if (offer.user.memberType === MemberCategory.TRADER)
            {
                // for the items, check the barter schemes. The method getDisplayableAssorts sets a flag sptQuestLocked
                // to true if the quest is not completed yet
                if (this.ragfairOfferHelper.traderOfferItemQuestLocked(offer, traderAssorts))
                {
                    offer.locked = true;
                }

                // Update offers BuyRestrictionCurrent/BuyRestrictionMax values
                this.setTraderOfferPurchaseLimits(offer, profile);
                this.setTraderOfferStackSize(offer);
            }
        }

        result.offersCount = result.offers.length;

        // Handle paging before returning results only if searching for general items, not preset items
        if (searchRequest.buildCount === 0)
        {
            const start = searchRequest.page * searchRequest.limit;
            const end = Math.min((searchRequest.page + 1) * searchRequest.limit, result.offers.length);
            result.offers = result.offers.slice(start, end);
        }
        return result;
    }

    /**
     * Handle client/ragfair/offer/findbyid
     * Occurs when searching for `#x` on flea
     * @param sessionId Player id
     * @param request Request data
     * @returns IRagfairOffer
     */
    public getOfferById(sessionId: string, request: IGetRagfairOfferByIdRequest): IRagfairOffer
    {
        const offers = this.ragfairOfferService.getOffers();
        const offerToReturn = offers.find((offer) => offer.intId === request.id);

        return offerToReturn;
    }

    /**
     * Get offers for the client based on type of search being performed
     * @param searchRequest Client search request data
     * @param itemsToAdd Comes from ragfairHelper.filterCategories()
     * @param traderAssorts Trader assorts
     * @param pmcProfile Player profile
     * @returns array of offers
     */
    protected getOffersForSearchType(
        searchRequest: ISearchRequestData,
        itemsToAdd: string[],
        traderAssorts: Record<string, ITraderAssort>,
        pmcProfile: IPmcData,
    ): IRagfairOffer[]
    {
        // Searching for items in preset menu
        if (searchRequest.buildCount)
        {
            return this.ragfairOfferHelper.getOffersForBuild(searchRequest, itemsToAdd, traderAssorts, pmcProfile);
        }

        if (searchRequest.neededSearchId?.length > 0)
        {
            return this.ragfairOfferHelper.getOffersThatRequireItem(searchRequest, pmcProfile);
        }

        // Searching for general items
        return this.ragfairOfferHelper.getValidOffers(searchRequest, itemsToAdd, traderAssorts, pmcProfile);
    }

    /**
     * Get categories for the type of search being performed, linked/required/all
     * @param searchRequest Client search request data
     * @param offers Ragfair offers to get categories for
     * @returns record with templates + counts
     */
    protected getSpecificCategories(
        pmcProfile: IPmcData,
        searchRequest: ISearchRequestData,
        offers: IRagfairOffer[],
    ): Record<string, number>
    {
        // Linked/required search categories
        const playerHasFleaUnlocked
            = pmcProfile.Info.Level >= this.databaseService.getGlobals().config.RagFair.minUserLevel;
        let offerPool = [];
        if (this.isLinkedSearch(searchRequest) || this.isRequiredSearch(searchRequest))
        {
            offerPool = offers;
        }
        else if (!(this.isLinkedSearch(searchRequest) || this.isRequiredSearch(searchRequest)))
        {
            // Get all categories
            offerPool = this.ragfairOfferService.getOffers();
        }
        else
        {
            this.logger.error(this.localisationService.getText("ragfair-unable_to_get_categories"));
            this.logger.debug(JSON.stringify(searchRequest));
            return {};
        }

        return this.ragfairServer.getAllActiveCategories(playerHasFleaUnlocked, searchRequest, offerPool);
    }

    /**
     * Add index to all offers passed in (0-indexed)
     * @param offers Offers to add index value to
     */
    protected addIndexValueToOffers(offers: IRagfairOffer[]): void
    {
        let counter = 0;

        for (const offer of offers)
        {
            offer.intId = ++counter;
            offer.items[0].parentId = ""; // Without this it causes error: "Item deserialization error: No parent with id hideout found for item x"
        }
    }

    /**
     * Update a trader flea offer with buy restrictions stored in the traders assort
     * @param offer Flea offer to update
     * @param fullProfile Players full profile
     */
    protected setTraderOfferPurchaseLimits(offer: IRagfairOffer, fullProfile: ISptProfile): void
    {
        // No trader found, create a blank record for them
        fullProfile.traderPurchases[offer.user.id] ||= {};

        const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(offer.user.id).items;
        const assortId = offer.items[0]._id;
        const assortData = traderAssorts.find((item) => item._id === assortId);

        // Use value stored in profile, otherwise use value directly from in-memory trader assort data
        offer.buyRestrictionCurrent = fullProfile.traderPurchases[offer.user.id][assortId]
            ? fullProfile.traderPurchases[offer.user.id][assortId].count
            : assortData.upd.BuyRestrictionCurrent;

        offer.buyRestrictionMax = assortData.upd.BuyRestrictionMax;
    }

    /**
     * Adjust ragfair offer stack count to match same value as traders assort stack count
     * @param offer Flea offer to adjust stack size of
     */
    protected setTraderOfferStackSize(offer: IRagfairOffer): void
    {
        const firstItem = offer.items[0];
        const traderAssorts = this.traderHelper.getTraderAssortsByTraderId(offer.user.id).items;

        const assortPurchased = traderAssorts.find((x) => x._id === offer.items[0]._id);
        if (!assortPurchased)
        {
            this.logger.warning(
                this.localisationService.getText("ragfair-unable_to_adjust_stack_count_assort_not_found", {
                    offerId: offer.items[0]._id,
                    traderId: offer.user.id,
                }),
            );

            return;
        }

        firstItem.upd.StackObjectsCount = assortPurchased.upd.StackObjectsCount;
    }

    /**
     * Is the flea search being performed a 'linked' search type
     * @param info Search request
     * @returns True if it is a 'linked' search type
     */
    protected isLinkedSearch(info: ISearchRequestData): boolean
    {
        return info.linkedSearchId !== "";
    }

    /**
     * Is the flea search being performed a 'required' search type
     * @param info Search request
     * @returns True if it is a 'required' search type
     */
    protected isRequiredSearch(info: ISearchRequestData): boolean
    {
        return info.neededSearchId !== "";
    }

    /**
     * Check all profiles and sell player offers / send player money for listing if it sold
     */
    public update(): void
    {
        const profilesDict = this.saveServer.getProfiles();
        for (const sessionID in this.saveServer.getProfiles())
        {
            // Check profile is capable of creating offers
            const pmcProfile = profilesDict[sessionID].characters.pmc;
            if (
                pmcProfile.RagfairInfo !== undefined
                && pmcProfile.Info.Level >= this.databaseService.getGlobals().config.RagFair.minUserLevel
            )
            {
                this.ragfairOfferHelper.processOffersOnProfile(sessionID);
            }
        }
    }

    /**
     * Called when creating an offer on flea, fills values in top right corner
     * @param getPriceRequest
     * @returns min/avg/max values for an item based on flea offers available
     */
    public getItemMinAvgMaxFleaPriceValues(getPriceRequest: IGetMarketPriceRequestData): IGetItemPriceResult
    {
        // Get all items of tpl
        const offers = this.ragfairOfferService.getOffersOfType(getPriceRequest.templateId);

        // Offers exist for item, get averages of what's listed
        if (typeof offers === "object" && offers.length > 0)
        {
            // These get calculated while iterating through the list below
            let min = Number.MAX_VALUE;
            let max = 0;

            // Get the average offer price, excluding barter offers
            let avgOfferCount = 0;
            const avg
                = offers.reduce((sum, offer) =>
                {
                    // Exclude barter items, they tend to have outrageous equivalent prices
                    if (offer.requirements.some((req) => !this.paymentHelper.isMoneyTpl(req._tpl)))
                    {
                        return sum;
                    }

                    // Figure out how many items the requirementsCost is applying to, and what the per-item price is
                    const offerItemCount = Math.max(
                        offer.sellInOnePiece ? offer.items[0].upd?.StackObjectsCount ?? 1 : 1,
                    );
                    const perItemPrice = offer.requirementsCost / offerItemCount;

                    // Handle min/max calculations based on the per-item price
                    if (perItemPrice < min)
                    {
                        min = perItemPrice;
                    }
                    else if (perItemPrice > max)
                    {
                        max = perItemPrice;
                    }

                    avgOfferCount++;
                    return sum + perItemPrice;
                }, 0) / Math.max(avgOfferCount, 1);

            // If no items were actually counted, min will still be MAX_VALUE, so set it to 0
            if (min === Number.MAX_VALUE)
            {
                min = 0;
            }

            return { avg: Math.round(avg), min: min, max: max };
        }

        // No offers listed, get price from live ragfair price list prices.json
        let tplPrice = this.databaseService.getPrices()[getPriceRequest.templateId];
        if (!tplPrice)
        {
            // No flea price, get handbook price
            tplPrice = this.handbookHelper.getTemplatePrice(getPriceRequest.templateId);
        }

        return { avg: tplPrice, min: tplPrice, max: tplPrice };
    }

    /**
     * List item(s) on flea for sale
     * @param pmcData Player profile
     * @param offerRequest Flea list creation offer
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public addPlayerOffer(
        pmcData: IPmcData,
        offerRequest: IAddOfferRequestData,
        sessionID: string,
    ): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const fullProfile = this.saveServer.getProfile(sessionID);
        const sellAsPack = offerRequest.sellInOnePiece; // a group of items that much be all purchased at once
        const itemsToListCount = offerRequest.items.length; // Count of root items being sold (no children)

        const validationMessage = "";
        if (!this.isValidPlayerOfferRequest(offerRequest, validationMessage))
        {
            return this.httpResponse.appendErrorToOutput(output, validationMessage);
        }

        const typeOfOffer = this.getOfferType(offerRequest);

        // Find items to be listed on flea from player inventory
        const { items: itemsInInventoryToList, errorMessage: itemsInInventoryError }
            = this.getItemsToListOnFleaFromInventory(pmcData, offerRequest.items);
        if (!itemsInInventoryToList || itemsInInventoryError)
        {
            this.httpResponse.appendErrorToOutput(output, itemsInInventoryError);
        }

        // Checks are done, create the offer
        const playerListedPriceInRub = this.calculateRequirementsPriceInRub(offerRequest.requirements);
        const offer = this.createPlayerOffer(
            sessionID,
            offerRequest.requirements,
            this.ragfairHelper.mergeStackable(itemsInInventoryToList),
            sellAsPack,
        );
        const rootItem = offer.items[0];

        // Get average of items quality+children
        const qualityMultiplier = this.itemHelper.getItemQualityModifierForItems(offer.items, true);
        let averageOfferPrice = this.ragfairPriceService.getFleaPriceForOfferItems(offer.items);

        // Check for and apply item price modifer if it exists in config
        const itemPriceModifer = this.ragfairConfig.dynamic.itemPriceMultiplier[rootItem._tpl];
        if (itemPriceModifer)
        {
            averageOfferPrice *= itemPriceModifer;
        }

        // Multiply single item price by quality
        averageOfferPrice *= qualityMultiplier;

        // Define packs as a single count item
        const itemStackCount = sellAsPack
            ? 1
            : itemsToListCount;

        // Average out price of offer
        const averageSingleItemPrice = sellAsPack
            ? averageOfferPrice / itemsToListCount // Packs contains multiple items sold as one
            : averageOfferPrice / itemStackCount; // Normal offer, single items can be purchased from listing

        // Get averaged price of player listing to use when calculating sell chance
        const averagePlayerListedPriceInRub = sellAsPack
            ? playerListedPriceInRub / itemsToListCount
            : playerListedPriceInRub;

        // Packs are reduced to the average price of a single item in the pack vs the averaged single price of an item
        const sellChancePercent = this.ragfairSellHelper.calculateSellChance(
            averageSingleItemPrice,
            averagePlayerListedPriceInRub,
            qualityMultiplier,
        );
        offer.sellResult = this.ragfairSellHelper.rollForSale(sellChancePercent, itemStackCount);

        // Subtract flea market fee from stash
        if (this.ragfairConfig.sell.fees)
        {
            const taxFeeChargeFailed = this.chargePlayerTaxFee(
                sessionID,
                rootItem,
                pmcData,
                playerListedPriceInRub,
                itemStackCount,
                offerRequest,
                output,
            );
            if (taxFeeChargeFailed)
            {
                return output;
            }
        }

        // Add offer to players profile + add to client response
        fullProfile.characters.pmc.RagfairInfo.offers.push(offer);
        output.profileChanges[sessionID].ragFairOffers.push(offer);

        // Remove items from inventory after creating offer
        for (const itemToRemove of offerRequest.items)
        {
            this.inventoryHelper.removeItem(pmcData, itemToRemove, sessionID, output);
        }

        return output;
    }

    protected getOfferType(offerRequest: IAddOfferRequestData): FleaOfferType
    {
        if (offerRequest.items.length == 1 && !offerRequest.sellInOnePiece)
        {
            return FleaOfferType.SINGLE;
        }
        else if (offerRequest.items.length > 1 && !offerRequest.sellInOnePiece)
        {
            return FleaOfferType.MULTI;
        }
        else if (offerRequest.sellInOnePiece)
        {
            return FleaOfferType.PACK;
        }

        return FleaOfferType.UNKNOWN;
    }

    /**
     * Charge player a listing fee for using flea, pulls charge from data previously sent by client
     * @param sessionID Player id
     * @param rootItem Base item being listed (used when client tax cost not found and must be done on server)
     * @param pmcData Player profile
     * @param requirementsPriceInRub Rouble cost player chose for listing (used when client tax cost not found and must be done on server)
     * @param itemStackCount How many items were listed in player (used when client tax cost not found and must be done on server)
     * @param offerRequest Add offer request object from client
     * @param output IItemEventRouterResponse
     * @returns True if charging tax to player failed
     */
    protected chargePlayerTaxFee(
        sessionID: string,
        rootItem: Item,
        pmcData: IPmcData,
        requirementsPriceInRub: number,
        itemStackCount: number,
        offerRequest: IAddOfferRequestData,
        output: IItemEventRouterResponse,
    ): boolean
    {
        // Get tax from cache hydrated earlier by client, if that's missing fall back to server calculation (inaccurate)
        const storedClientTaxValue = this.ragfairTaxService.getStoredClientOfferTaxValueById(offerRequest.items[0]);
        const tax = storedClientTaxValue
            ? storedClientTaxValue.fee
            : this.ragfairTaxService.calculateTax(
                rootItem,
                pmcData,
                requirementsPriceInRub,
                itemStackCount,
                offerRequest.sellInOnePiece,
            );

        this.logger.debug(`Offer tax to charge: ${tax}, pulled from client: ${!!storedClientTaxValue}`);

        // cleanup of cache now we've used the tax value from it
        this.ragfairTaxService.clearStoredOfferTaxById(offerRequest.items[0]);

        const buyTradeRequest = this.createBuyTradeRequestObject("RUB", tax);
        this.paymentService.payMoney(pmcData, buyTradeRequest, sessionID, output);
        if (output.warnings.length > 0)
        {
            this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("ragfair-unable_to_pay_commission_fee", tax),
            );
            return true;
        }

        return false;
    }

    /**
     * Is the item to be listed on the flea valid
     * @param offerRequest Client offer request
     * @param errorMessage message to show to player when offer is invalid
     * @returns Is offer valid
     */
    protected isValidPlayerOfferRequest(offerRequest: IAddOfferRequestData, errorMessage: string): boolean
    {
        if (!offerRequest?.items || offerRequest.items.length === 0)
        {
            this.logger.error(this.localisationService.getText("ragfair-invalid_player_offer_request"));

            return false;
        }

        if (!offerRequest.requirements)
        {
            this.logger.error(this.localisationService.getText("ragfair-unable_to_place_offer_with_no_requirements"));

            return false;
        }

        return true;
    }

    /**
     * Get the handbook price in roubles for the items being listed
     * @param requirements
     * @returns Rouble price
     */
    protected calculateRequirementsPriceInRub(requirements: Requirement[]): number
    {
        let requirementsPriceInRub = 0;
        for (const item of requirements)
        {
            const requestedItemTpl = item._tpl;

            if (this.paymentHelper.isMoneyTpl(requestedItemTpl))
            {
                requirementsPriceInRub += this.handbookHelper.inRUB(item.count, requestedItemTpl);
            }
            else
            {
                requirementsPriceInRub
                    += this.ragfairPriceService.getDynamicPriceForItem(requestedItemTpl) * item.count;
            }
        }

        return requirementsPriceInRub;
    }

    /**
     * Using item ids from flea offer request, find corresponding items from player inventory and return as array
     * @param pmcData Player profile
     * @param itemIdsFromFleaOfferRequest Ids from request
     * @returns Array of items from player inventory
     */
    protected getItemsToListOnFleaFromInventory(
        pmcData: IPmcData,
        itemIdsFromFleaOfferRequest: string[],
    ): { items: Item[] | undefined, errorMessage: string | undefined }
    {
        const itemsToReturn = [];
        let errorMessage: string | undefined = undefined;

        // Count how many items are being sold and multiply the requested amount accordingly
        for (const itemId of itemIdsFromFleaOfferRequest)
        {
            let item = pmcData.Inventory.items.find((i) => i._id === itemId);
            if (!item)
            {
                errorMessage = this.localisationService.getText("ragfair-unable_to_find_item_in_inventory", {
                    id: itemId,
                });
                this.logger.error(errorMessage);

                return { items: undefined, errorMessage };
            }

            item = this.itemHelper.fixItemStackCount(item);
            itemsToReturn.push(...this.itemHelper.findAndReturnChildrenAsItems(pmcData.Inventory.items, itemId));
        }

        if (!itemsToReturn?.length)
        {
            errorMessage = this.localisationService.getText("ragfair-unable_to_find_requested_items_in_inventory");
            this.logger.error(errorMessage);

            return { items: undefined, errorMessage };
        }

        return { items: itemsToReturn, errorMessage };
    }

    public createPlayerOffer(
        sessionId: string,
        requirements: Requirement[],
        items: Item[],
        sellInOnePiece: boolean,
    ): IRagfairOffer
    {
        const loyalLevel = 1;
        const formattedItems: Item[] = items.map((item) =>
        {
            const isChild = items.some((it) => it._id === item.parentId);
            if (!isChild && !sellInOnePiece)
            {
                // Ensure offer with multiple of an item has its stack count reset
                item.upd.StackObjectsCount = 1;
            }

            return {
                _id: item._id,
                _tpl: item._tpl,
                parentId: isChild ? item.parentId : "hideout",
                slotId: isChild ? item.slotId : "hideout",
                upd: item.upd,
            };
        });

        const formattedRequirements: IBarterScheme[] = requirements.map((item) =>
        {
            return {
                _tpl: item._tpl,
                count: item.count,
                onlyFunctional: item.onlyFunctional };
        });

        return this.ragfairOfferGenerator.createAndAddFleaOffer(
            sessionId,
            this.timeUtil.getTimestamp(),
            formattedItems,
            formattedRequirements,
            loyalLevel,
            sellInOnePiece,
        );
    }

    public getAllFleaPrices(): Record<string, number>
    {
        return this.ragfairPriceService.getAllFleaPrices();
    }

    public getStaticPrices(): Record<string, number>
    {
        return this.ragfairPriceService.getAllStaticPrices();
    }

    /**
     * User requested removal of the offer, actually reduces the time to 71 seconds,
     * allowing for the possibility of extending the auction before it's end time
     * @param removeRequest Remove offer request
     * @param sessionId Players id
     * @returns IItemEventRouterResponse
     */
    public removeOffer(removeRequest: IRemoveOfferRequestData, sessionId: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionId);

        const pmcData = this.saveServer.getProfile(sessionId).characters.pmc;
        const playerProfileOffers = pmcData.RagfairInfo.offers;
        if (!playerProfileOffers)
        {
            this.logger.warning(
                this.localisationService.getText("ragfair-unable_to_remove_offer_not_found_in_profile", {
                    profileId: sessionId,
                    offerId: removeRequest.offerId,
                }),
            );

            pmcData.RagfairInfo.offers = [];
        }

        const playerOfferIndex = playerProfileOffers.findIndex((offer) => offer._id === removeRequest.offerId);
        if (playerOfferIndex === -1)
        {
            this.logger.error(
                this.localisationService.getText("ragfair-offer_not_found_in_profile", {
                    offerId: removeRequest.offerId,
                }),
            );
            return this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("ragfair-offer_not_found_in_profile_short"),
            );
        }

        const differenceInSeconds = playerProfileOffers[playerOfferIndex].endTime - this.timeUtil.getTimestamp();
        if (differenceInSeconds > this.ragfairConfig.sell.expireSeconds)
        {
            // `expireSeconds` Default is 71 seconds
            const newEndTime = this.ragfairConfig.sell.expireSeconds + this.timeUtil.getTimestamp();
            playerProfileOffers[playerOfferIndex].endTime = Math.round(newEndTime);
        }

        return output;
    }

    /**
     * Extend a ragfair offers listing time
     * @param extendRequest Extend offer request
     * @param sessionId Players id
     * @returns IItemEventRouterResponse
     */
    public extendOffer(extendRequest: IExtendOfferRequestData, sessionId: string): IItemEventRouterResponse
    {
        const output = this.eventOutputHolder.getOutput(sessionId);

        const pmcData = this.saveServer.getProfile(sessionId).characters.pmc;
        const playerOffers = pmcData.RagfairInfo.offers;
        const playerOfferIndex = playerOffers.findIndex((offer) => offer._id === extendRequest.offerId);
        const secondsToAdd = extendRequest.renewalTime * TimeUtil.ONE_HOUR_AS_SECONDS;

        if (playerOfferIndex === -1)
        {
            this.logger.warning(
                this.localisationService.getText("ragfair-offer_not_found_in_profile", {
                    offerId: extendRequest.offerId,
                }),
            );
            return this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("ragfair-offer_not_found_in_profile_short"),
            );
        }

        // MOD: Pay flea market fee
        if (this.ragfairConfig.sell.fees)
        {
            const count = playerOffers[playerOfferIndex].sellInOnePiece
                ? 1
                : playerOffers[playerOfferIndex].items.reduce((sum, item) =>
                {
                    return sum + item.upd.StackObjectsCount;
                }, 0);

            const tax = this.ragfairTaxService.calculateTax(
                playerOffers[playerOfferIndex].items[0],
                this.profileHelper.getPmcProfile(sessionId),
                playerOffers[playerOfferIndex].requirementsCost,
                count,
                playerOffers[playerOfferIndex].sellInOnePiece,
            );

            const request = this.createBuyTradeRequestObject("RUB", tax);
            this.paymentService.payMoney(pmcData, request, sessionId, output);
            if (output.warnings.length > 0)
            {
                return this.httpResponse.appendErrorToOutput(
                    output,
                    this.localisationService.getText("ragfair-unable_to_pay_commission_fee"),
                );
            }
        }

        // Add extra time to offer
        playerOffers[playerOfferIndex].endTime += Math.round(secondsToAdd);

        return output;
    }

    /**
     * Create a basic trader request object with price and currency type
     * @param currency What currency: RUB, EURO, USD
     * @param value Amount of currency
     * @returns IProcessBuyTradeRequestData
     */
    protected createBuyTradeRequestObject(currency: string, value: number): IProcessBuyTradeRequestData
    {
        return {
            tid: "ragfair",
            Action: "TradingConfirm",
            scheme_items: [{ id: this.paymentHelper.getCurrency(currency), count: Math.round(value) }],
            type: "",
            item_id: "",
            count: 0,
            scheme_id: 0,
        };
    }
}

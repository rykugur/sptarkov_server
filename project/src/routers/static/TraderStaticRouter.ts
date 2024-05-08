import { inject, injectable } from "tsyringe";
import { TraderCallbacks } from "@spt-aki/callbacks/TraderCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { ITraderBase } from "@spt-aki/models/eft/common/tables/ITrader";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";

@injectable()
export class TraderStaticRouter extends StaticRouter
{
    constructor(@inject("TraderCallbacks") protected traderCallbacks: TraderCallbacks)
    {
        super([
            new RouteAction(
                "/client/trading/api/traderSettings",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ITraderBase[]>> =>
                {
                    return this.traderCallbacks.getTraderSettings(url, info, sessionID);
                },
            ),
        ]);
    }
}

import { inject, injectable } from "tsyringe";
import { DataCallbacks } from "@spt-aki/callbacks/DataCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IGlobals } from "@spt-aki/models/eft/common/IGlobals";
import { ICustomizationItem } from "@spt-aki/models/eft/common/tables/ICustomizationItem";
import { IHandbookBase } from "@spt-aki/models/eft/common/tables/IHandbookBase";
import { IHideoutArea } from "@spt-aki/models/eft/hideout/IHideoutArea";
import { IHideoutProduction } from "@spt-aki/models/eft/hideout/IHideoutProduction";
import { IHideoutScavCase } from "@spt-aki/models/eft/hideout/IHideoutScavCase";
import { IHideoutSettingsBase } from "@spt-aki/models/eft/hideout/IHideoutSettingsBase";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { ISettingsBase } from "@spt-aki/models/spt/server/ISettingsBase";

@injectable()
export class DataStaticRouter extends StaticRouter
{
    constructor(@inject("DataCallbacks") protected dataCallbacks: DataCallbacks)
    {
        super([
            new RouteAction(
                "/client/settings",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<ISettingsBase>> =>
                {
                    return this.dataCallbacks.getSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/globals",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IGlobals>> =>
                {
                    return this.dataCallbacks.getGlobals(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/items",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.dataCallbacks.getTemplateItems(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/handbook/templates",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHandbookBase>> =>
                {
                    return this.dataCallbacks.getTemplateHandbook(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/customization",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<Record<string, ICustomizationItem>>> =>
                {
                    return this.dataCallbacks.getTemplateSuits(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/account/customization",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<string[]>> =>
                {
                    return this.dataCallbacks.getTemplateCharacter(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/production/recipes",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutProduction[]>> =>
                {
                    return this.dataCallbacks.gethideoutProduction(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/settings",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutSettingsBase>> =>
                {
                    return this.dataCallbacks.getHideoutSettings(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/areas",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutArea[]>> =>
                {
                    return this.dataCallbacks.getHideoutAreas(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/production/scavcase/recipes",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IHideoutScavCase[]>> =>
                {
                    return this.dataCallbacks.getHideoutScavcase(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/languages",
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<Record<string, string>>> =>
                {
                    return this.dataCallbacks.getLocalesLanguages(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/hideout/qte/list",
                async (url: string, info: any, sessionID: string, output: string): Promise<string> =>
                {
                    return this.dataCallbacks.getQteList(url, info, sessionID);
                },
            ),
        ]);
    }
}

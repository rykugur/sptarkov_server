import { inject, injectable } from "tsyringe";
import { BuildsCallbacks } from "@spt-aki/callbacks/BuildsCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";
import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";
import { IUserBuilds } from "@spt-aki/models/eft/profile/IAkiProfile";

@injectable()
export class BuildsStaticRouter extends StaticRouter
{
    constructor(@inject("BuildsCallbacks") protected buildsCallbacks: BuildsCallbacks)
    {
        super([
            new RouteAction(
                "/client/builds/list",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                async (
                    url: string,
                    info: any,
                    sessionID: string,
                    output: string,
                ): Promise<IGetBodyResponseData<IUserBuilds>> =>
                {
                    return this.buildsCallbacks.getBuilds(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/magazine/save",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.buildsCallbacks.createMagazineTemplate(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/weapon/save",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.buildsCallbacks.setWeapon(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/equipment/save",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.buildsCallbacks.setEquipment(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/client/builds/delete",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                async (url: string, info: any, sessionID: string, output: string): Promise<INullResponseData> =>
                {
                    return this.buildsCallbacks.deleteBuild(url, info, sessionID);
                },
            ),
        ]);
    }
}

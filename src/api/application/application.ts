import { Base, Bare, Reply, RuntimeEvent } from '../base';
import { Identity } from '../../identity';
import { _Window } from '../window/window';
import { Point } from '../system/point';
import { MonitorInfo } from '../system/monitor';
import Transport from '../../transport/transport';

export interface TrayIconClickReply extends Point, Reply<'application', 'tray-icon-clicked'> {
    button: number;
    monitorInfo: MonitorInfo;
}

export class NavigationRejectedReply extends Reply<'window-navigation-rejected', void> {
    public sourceName: string;
    public url: string;
}

export default class ApplicationModule extends Bare {

    /**
     * Returns an Application object that represents an existing application.
     * @param { Identity } indentity
     * @return {Application}
    */
    public wrap(identity: Identity): Application {
        return new Application(this.wire, identity);
    }

    /**
     * @param {*} appOptions
     * @return {Application}
     */
    public create(appOptions: any): Promise<Application> {
        return this.wire.sendAction('create-application', appOptions)
            .then(() => this.wrap({ uuid: appOptions.uuid }));
    }
}

/**
 * @classdesc An object representing an application. Allows the developer to create,
 * execute, show/close an application as well as listen to application events.
 * @class
*/
export class Application extends Base {

    constructor(wire: Transport, public identity: Identity) {
        super(wire);

        this.on('removeListener', eventType => {
            this.deregisterEventListener(Object.assign({}, this.identity, {
                type: eventType,
                topic : this.topic
            }));
        });

        this.on('newListener', eventType => {
            this.registerEventListener(Object.assign({}, this.identity, {
                type: eventType,
                topic : this.topic
            }));
        });
    }

    protected runtimeEventComparator(listener: RuntimeEvent): boolean {
        return listener.topic === this.topic && listener.uuid === this.identity.uuid;
    }

    private windowListFromNameList(nameList: Array<string>): Array<_Window> {
        const windowList: Array<_Window> = [];
        // tslint:disable-next-line
        for (let i = 0; i < nameList.length; i++) {
            windowList.push(new _Window(this.wire, {
                uuid: <string>this.identity.uuid,
                name: nameList[i]
            }));
        }
        return windowList;
    }

    /**
      * Determines if the application is currently running.
      * @return {Promise.<boolean>}
    */
    public isRunning(): Promise<boolean> {
        return this.wire.sendAction('is-application-running', this.identity)
            .then(({ payload }) => payload.data);
    }

    /**
      * Closes the application and any child windows created by the application.
      * @param { boolean } force assigns the value to false
      * @return {Promise.<boolean>}
    */
    public close(force: boolean = false): Promise<void> {
        return this.wire.sendAction('close-application', Object.assign({}, this.identity, {force})).then(() => undefined);
    }

    /**
     * Retrieves an array of wrapped fin.desktop.Windows for each of the application’s child windows.
     * @return {Promise.Array.<_Window>}
    */
    public getChildWindows(): Promise<Array<_Window>> {
        return this.wire.sendAction('get-child-windows', this.identity)
            .then(({ payload }) =>  this.windowListFromNameList(payload.data));
    }

    /**
     * Retrieves an array of active window groups for all of the application's windows. Each group is
     * represented as an array of wrapped fin.desktop.Windows.
     * @return {Promise.Array.Array.<_Window>}
    */
    public getGroups(): Promise<Array<Array<_Window>>> {
        const winGroups: Array<Array<_Window>> = <Array<Array<_Window>>>[];
        return this.wire.sendAction('get-application-groups', this.identity)
            .then(({ payload }) => {
                // tslint:disable-next-line
                for (let i = 0; i < payload.data.length; i++) {
                    winGroups[i] = this.windowListFromNameList(payload.data[i]);
                }

                return winGroups;
            });
    }

    /**
     * Retrieves the JSON manifest that was used to create the application. Invokes the error callback
     * if the application was not created from a manifest.
     * @return {Promise.<any>}
    */
    public getManifest(): Promise<any> {
        return this.wire.sendAction('get-application-manifest', this.identity)
            .then(({ payload }) => payload.data);
    }

    /**
     * Retrieves UUID of the application that launches this application. Invokes the error callback
     * if the application was created from a manifest.
     * @return {Promise.<string>}
    */
    public getParentUuid(): Promise<string> {
        return this.wire.sendAction('get-parent-application', this.identity)
            .then(({ payload }) => payload.data);
    }

    /**
     * Returns an instance of the main Window of the application
     * @tutorial Application.getWindow
     * @return {Promise.<_Window>}
    */
    public getWindow(): Promise<_Window> {
        return Promise.resolve(new _Window(this.wire, {
            uuid: <string>this.identity.uuid,
            name: <string>this.identity.uuid
        }));
    }

    /**
     * Passes in custom data that will be relayed to the RVM
     * @param { object } data Data to be passed to the RVM
     * @return {Promise.<void>}
    */
    public registerCustomData(data: Object): Promise<void> {
        return this.wire.sendAction('register-custom-data', Object.assign({}, this.identity, {data})).then(() => undefined);
    }

    /**
     * Removes the application’s icon from the tray.
     * @return {Promise.<void>}
     */
    public removeTrayIcon(): Promise<void> {
        return this.wire.sendAction('remove-tray-icon', this.identity).then(() => undefined);
    }

    /**
     * Restarts the application.
     * @return {Promise.<void>}
     */
    public restart(): Promise<void> {
        return this.wire.sendAction('restart-application', this.identity).then(() => undefined);
    }

    /**
     * Runs the application. When the application is created, run must be called.
     * @return {Promise.<void>}
     */
    public run(): Promise<void> {
        return this.wire.sendAction('run-application', this.identity).then(() => undefined);
    }

    /**
     * Instructs the RVM to schedule one restart of the application.
     * @return {Promise.<void>}
     */
    public scheduleRestart(): Promise<void> {
        return this.wire.sendAction('relaunch-on-close', this.identity).then(() => undefined);
    }

    /**
     * Adds a customizable icon in the system tray and notifies the application when clicked.
     * @param { string } iconUrl Image URL to be used as the icon
     * @return {Promise.<void>}
     */
    public setTrayIcon(iconUrl: string): Promise<void> {
        return this.wire.sendAction('set-tray-icon', Object.assign({}, this.identity, {
            enabledIcon: iconUrl
        })).then(() => undefined);
    }

    /**
     * Closes the application by terminating its process.
     * @return {Promise.<void>}
     */
    public terminate(): Promise<void> {
        return this.wire.sendAction('terminate-application', this.identity).then(() => undefined);
    }

    /**
     * Waits for a hanging application. This method can be called in response to an application
     * "not-responding" to allow the application to continue and to generate another "not-responding"
     * message after a certain period of time.
     * @return {Promise.<void>}
     */
    public wait(): Promise<void> {
        return this.wire.sendAction('wait-for-hung-application', this.identity).then(() => undefined);
    }

}

export interface Application {
    on(type: 'closed', listener: (data: Reply<'application', 'closed'>) => void): this;
    on(type: 'connected', listener: (data: Reply<'application', 'connected'>) => void): this;
    on(type: 'crashed', listener: (data: Reply<'application', 'crashed'>) => void): this;
    on(type: 'error', listener: (data: Reply<'application', 'error'>) => void): this;
    on(type: 'not-responding', listener: (data: Reply<'application', 'not-responding'>) => void): this;
    on(type: 'out-of-memory', listener: (data: Reply<'application', 'out-of-memory'>) => void): this;
    on(type: 'responding', listener: (data: Reply<'application', 'responding'>) => void): this;
    on(type: 'started', listener: (data: Reply<'application', 'started'>) => void): this;
    on(type: 'run-requested', listener: (data: Reply<'application', 'run-requested'>) => void): this;
    on(type: 'window-navigation-rejected', listener: (data: NavigationRejectedReply) => void): this;
    on(type: 'window-created', listener: (data: Reply<'application', 'window-created'>) => void): this;
    on(type: 'window-closed', listener: (data: Reply<'application', 'window-closed'>) => void): this;
    on(type: 'tray-icon-clicked', listener: (data: TrayIconClickReply) => void): this;
    on(type: 'removeListener', listener: (eventType: string) => void): this;
    on(type: 'newListener', listener: (eventType: string) => void): this;
}

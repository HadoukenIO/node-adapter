import * as assert from 'assert';
import { conn } from './connect';
import { Fin, launch } from '../src/main';
import * as path from 'path';
import { cleanOpenRuntimes } from './multi-runtime-utils';
import { delayPromise } from './delay-promise';
import * as sinon from 'sinon';
import * as fs from 'fs';

describe ('External Services', () => {
    let fin: Fin;
    let appConfig: any;

    beforeEach(async () => {
        await cleanOpenRuntimes();
        appConfig = JSON.parse(fs.readFileSync(path.resolve('test/app.json')).toString());
        fin = await conn();
    });

    // tslint:disable-next-line
    describe('External Provider', function () {

        it('Should be able to register as Provider', function(done: any) {
            // tslint:disable-next-line no-invalid-this
            this.timeout(8000);

            const url = appConfig.startup_app.url;
            const newUrl = url.slice(0, url.lastIndexOf('/')) + '/client.html';

            const clientConfig : any = {
                ...appConfig,
                'startup_app': {
                    'name': 'Services',
                    'description': 'services test app',
                    'url': newUrl,
                    'uuid': 'service-client-test',
                    'autoShow': true,
                    'saveWindowState': false,
                    'nonPersistent': true,
                    'experimental': {
                        'v2Api': true
                    }
                }
            };

            fs.writeFileSync(path.resolve('test/client.json'), JSON.stringify(clientConfig));

            async function test () {
                const spy = sinon.spy();
                const provider = await fin.Service.register();
                provider.register('test', () => {
                    spy();
                    return 'return-test';
                });
                provider.onConnection(c => {
                    spy();
                });
                await launch({manifestUrl: path.resolve('test', 'client.json')});
                await fin.InterApplicationBus.subscribe({uuid: 'service-client-test'}, 'return', (msg: any) => {
                    assert(spy.calledTwice && msg === 'return-test', 'Did not get IAB from dispatch');
                    done();
                });
                await delayPromise(1000);
                await fin.InterApplicationBus.publish('start', 'hi');
            }
            test();
        });

    });

    // tslint:disable-next-line
    describe('External Client', function () {

        it('Should be able to connect as Client', function(done: any) {
            // tslint:disable-next-line no-invalid-this
            this.timeout(8000);

            const url = appConfig.startup_app.url;
            const newUrl = url.slice(0, url.lastIndexOf('/')) + '/service.html';

            const serviceConfig : any = {
                ...appConfig,
                'startup_app': {
                    'name': 'Service Provider',
                    'description': 'Service Provider test app',
                    'url': newUrl,
                    'uuid': 'service-provider-test',
                    'autoShow': true,
                    'saveWindowState': false,
                    'nonPersistent': true,
                    'experimental': {
                        'v2Api': true
                    }
                }
            };

            fs.writeFileSync(path.resolve('test/service.json'), JSON.stringify(serviceConfig));

            async function test() {
                await launch({manifestUrl: path.resolve('test', 'service.json')});
                const client = await fin.Service.connect({uuid: 'service-provider-test'});
                client.dispatch('test').then(res => {
                    assert(res === 'return-test');
                    done();
                });
            }
            test();
        });
    });
});
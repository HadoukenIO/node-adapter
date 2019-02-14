import * as path from 'path';
import * as https from 'https';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify, promiseMap } from '../util/promises';

const stat = promisify(fs.stat);
export async function exists(path: string): Promise<Boolean> {
    try {
        const exists = await stat(path);
        return Boolean(exists);
    } catch (e) {
        return false;
    }
}

function getProxy() {
    const parsedUrl = new URL(proxyExists());
    return {
        port: parsedUrl.port,
        host: parsedUrl.hostname,
        username: parsedUrl.username,
        password: parsedUrl.password
    };
}

function proxyExists() {
    return process.env.HTTPS_PROXY || process.env.https_proxy;
}

function getRequestOptions(url: string) {
    const parsedUrl = new URL(url);

    const options = {
        host: parsedUrl.host,
        path: parsedUrl.pathname,
        port: '',
        headers: { Host: '' }
    };

    if (proxyExists()) {
        const proxy = getProxy();
        options.host = proxy.host;
        options.port = proxy.port;
        options.path = url;
        options.headers.Host = parsedUrl.host;
        if (proxy.username && proxy.password) {
            const auth = 'Basic ' + Buffer.from(proxy.username + ':' + proxy.password).toString('base64');
            Object.assign(options.headers, { 'Proxy-Authorization': auth });
        }
    }

    return options;
}

export async function get(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const options = getRequestOptions(url);
        const request = https.get(options, (response) => {
            if (response.statusCode < 200 || response.statusCode > 299) {
                console.error('status code');
                reject(new Error('Failed to load page, status code: ' + response.statusCode));
            }
            const body: string[] = [];
            response.on('data', (chunk: string): void => {
                body.push(chunk);
            });
            response.on('end', (): void => resolve(body.join('')));
        });
        request.on('error', (err) => {
            console.error(err);
            reject(err);
        });
    });
}

export async function unzip(file: string, dest: string) {
    const ex = promisify(exec);
    return ex(`unzip ${file} -d ${dest}`, { encoding: 'utf8' });
}

const lstat = promisify(fs.lstat);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const rmdir = promisify(fs.rmdir);

export async function rmDir(dirPath: string, removeSelf: boolean = true) {
    let files: string[];
    try {
        files = await readdir(dirPath);
    } catch (e) {
        return;
    }
    if (files.length > 0) {
        await promiseMap(files, async (f: string) => {
            const filePath = dirPath + '/' + f;
            const file = await lstat(filePath);
            if (file.isFile() || file.isSymbolicLink()) {
                await unlink(filePath);
            } else {
                await rmDir(filePath, true);
            }
        });
    }
    if (removeSelf) {
        await rmdir(dirPath);
    }
}

export async function downloadFile(url: string, writeLocation: string) {
    return new Promise((resolve, reject) => {
        try {
            const options = getRequestOptions(url);

            https.get(options, (response) => {
                if (response.statusCode !== 200) {
                    if (response.statusCode === 404) {
                        reject(new Error('Specified runtime not available for OS'));
                    } else {
                        reject(new Error('Issue Downloading ' + response.statusCode));
                    }
                } else {
                    const fileSize = parseInt(response.headers['content-length'], 10);
                    let chunkCtr = 0;
                    let progress: number;
                    let output: string;

                    response.on('data', (chunk) => {
                        chunkCtr += chunk.length;
                        progress = Math.floor(100 * chunkCtr / fileSize);
                        output = 'Downloading Runtime: ' + progress + '%\r';
                        if (progress === 100) {
                            output = 'Downloading Runtime: ' + progress + '%\n';
                        }
                        process.stdout.write(output);
                    });

                    const file = fs.createWriteStream(writeLocation);
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

export async function resolveRuntimeVersion(versionOrChannel: string): Promise<string> {
    const splitVersion = versionOrChannel.split('.');
    const isVersion = splitVersion.length > 1 && splitVersion.every(x => x === '*' || /^\d+$/.test(x));
    if (isVersion) {
        const mustMatch = takeWhile(splitVersion, (x: string) => x !== '*');
        if (4 - mustMatch.length > 0) {
            //    tslint:disable-next-line:no-backbone-get-set-outside-model
            const res = await get('https://cdn.openfin.co/release/runtimeVersions');
            const versions = res.split('\r\n');
            const match = first(versions, (v: string) => v.split('.').slice(0, mustMatch.length).join('.') === mustMatch.join('.'));
            if (match) {
                return match;
            }
        } else {
            return versionOrChannel;
        }
    }
    try {
        // tslint:disable-next-line:no-backbone-get-set-outside-model
        return await get(`https://cdn.openfin.co/release/runtime/${versionOrChannel}`);
    } catch (err) {
        throw Error('Could not resolve runtime version');
    }
}

export function first<T>(arr: T[], func: (x: T, i: number, r: T[]) => boolean): T | null {
    // tslint:disable-next-line:no-increment-decrement
    for (let i = 0; i < arr.length; i++) {
        if (func(arr[i], i, arr)) {
            return arr[i];
        }
    }
    return null;
}

function takeWhile(arr: any[], func: (x: any, i: number, r: any[]) => boolean) {
    return arr.reduce(({ take, vals }, x: any, i: number, r: any[]) => take && func(x, i, r)
        ? { take: true, vals: [...vals, x] }
        : { take: false, vals },
        { take: true, vals: [] })
        .vals;
}

const mkdir = promisify(fs.mkdir);

export async function resolveDir(base: string, paths: string[]): Promise<string> {
    return await paths.reduce(async (p: Promise<string>, next: string) => {
        try {
            const prev = await p;
            await mkdir(path.resolve(prev, next));
            return path.join(prev, next);
        } catch (err) {
            return err.code === 'EEXIST' ? err.path : Promise.reject(err);
        }
    }, Promise.resolve(base));
}

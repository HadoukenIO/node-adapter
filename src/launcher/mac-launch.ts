import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { NewConnectConfig } from '../transport/wire';
import  {promisify, resolveRuntimeVersion, rmDir, downloadFile, unzip } from './util';

const runtimeRoot = 'https://developer.openfin.co/release/runtime/';
const mkdir = promisify(fs.mkdir);

export async function download (version: string, folder: string) {
  const url = `${runtimeRoot}mac/x64/${version}`;
  const tmp = 'tmp';
  await rmDir(folder, false);
  // tslint:disable-next-line:no-empty
  await mkdir(path.join(folder, tmp)).catch(e => {});
  const file = path.join(folder, tmp, 'tmp');
  await downloadFile(url, file);
  await unzip(file, folder);
  await rmDir(path.join(folder, tmp));
  return folder;
}

export async function getRuntimePath (version: string) : Promise<string> {
  const versionPath = ['OpenFin', 'Runtime', version];
  const HOME = process.env.HOME;
  const appendToPath = (next: string) =>  (val: string) => mkdir(path.join(val, next));
  const catchExistsError = (err: NodeJS.ErrnoException) => err.code === 'EEXIST' ? err.path : Promise.reject(err);
  return await versionPath.reduce(async (p: Promise<string>, next: string) => {
    try {
      const prev = await p;
      await appendToPath(next)(prev);
      return path.join(prev, next);
    } catch (e) {
      return await catchExistsError(e);
    }
  }, Promise.resolve(HOME));
}

export async function install (versionOrChannel: string): Promise < string > {
    const version = await resolveRuntimeVersion(versionOrChannel);
    const rtFolder: string = await getRuntimePath(version);
    const rtPath: string = path.join(rtFolder, 'OpenFin.app/Contents/MacOS/OpenFin');
    const exists = await promisify(fs.stat)(rtPath).catch(e => false);
    if (Boolean(exists)) {
      await promisify(fs.chmod)(rtPath, 0o755);
    } else {
      try {
        await download(version, rtFolder);
      } catch (err) {
          throw Error(`Could not install runtime ${versionOrChannel} (${version})`);
      }
    }
    return rtPath;
}

export default async function launch(config: NewConnectConfig, manifestLocation: string, namedPipeName: string): Promise < ChildProcess > {
  try {
    let fb = false;
    const runtimePath = await install(config.runtime.version)
    .catch(e => {
      if (config.runtime.fallbackVersion !== undefined) {
        fb = true;
        console.warn(`could not install openfin ${config.runtime.version}`);
        console.warn(`trying fallback ${config.runtime.fallbackVersion}`);
        return install(config.runtime.fallbackVersion);
      }
      return Promise.reject(e);
    });
    const args = config.runtime.additionalArgument ? config.runtime.additionalArgument.split(' ') : [];

    args.unshift(`--startup-url=${manifestLocation}`);
    args.push(`--version-keyword=${fb ? config.runtime.fallbackVersion : config.runtime.version}`);
    args.push(`--runtime-information-channel-v6=${namedPipeName}`);
    if (config.runtime.securityRealm) {
      args.push(`--security-realm=${config.runtime.securityRealm}`);
    }
    if (config.runtime.verboseLogging) {
       args.push('--v=1');
       args.push('--attach-console');
    }
    return spawn(runtimePath, args);
  } catch (e) {
    console.error('Failed to launch\n', e);
    throw e;
  }
}
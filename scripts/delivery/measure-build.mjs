import { execFileSync, spawnSync } from 'node:child_process';
import { hostname, platform, arch } from 'node:os';
import { readFile, writeFile } from 'node:fs/promises';
const docker = spawnSync('docker',['info','--format','{{.ServerVersion}}'],{encoding:'utf8'});
if (docker.status!==0) {process.stdout.write('DOCKER_BUILD DEFERRED: Docker Engine unavailable\n');process.exit(2);}
if (execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()) throw new Error('CLEAN_SUBMISSION_CHECKOUT_REQUIRED');
const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dockerfile = await readFile('Dockerfile','utf8');
const base = dockerfile.match(/^FROM (node:[^ ]+)/m)[1];
execFileSync('docker',['pull',base],{stdio:'inherit'});
const postgres = (await readFile('compose.yaml','utf8')).match(/image: (postgres:[^\r\n]+)/)[1];
execFileSync('docker',['pull',postgres],{stdio:'inherit'});
const start = performance.now();
const outcome = spawnSync('docker',['compose','build','--no-cache','app'],{stdio:'inherit',env:{...process.env,BUILD_SHA:sha}});
const seconds = Math.round((performance.now()-start)/100)/10;
const evidence = {kind:'docker_build',sha,utc:new Date().toISOString(),machine:{hostname:hostname(),platform:platform(),arch:arch()},
  engine:docker.stdout.trim(),baseImagePullExcluded:true,cache:'--no-cache',seconds,exitCode:outcome.status,
  result:outcome.status===0 && seconds<=300?'PASS':'FAIL'};
// Локальный evidence путь исключён .gitignore; publish только после review.
await writeFile('.env.build-evidence.json',JSON.stringify(evidence,null,2)+'\n');
process.stdout.write(JSON.stringify(evidence)+'\n');
if (evidence.result!=='PASS') process.exitCode=1;

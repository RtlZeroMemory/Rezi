import { resolve } from "node:path";
import { assert, test } from "@rezi-ui/testkit";
import { createInstallEnv, resolveInstallCwd, resolveInstallInvocation } from "../index.js";

const WINDOWS_ROAMING_NPM_EXEC_PATH =
  "C:\\Users\\example\\AppData\\Roaming\\npm\\node_modules\\npm\\bin\\npm-cli.js";

test("resolveInstallCwd resolves targetDir against the current base directory", () => {
  assert.equal(
    resolveInstallCwd("my-app", "/tmp/rezi-parent"),
    resolve("/tmp/rezi-parent", "my-app"),
  );
});

test("createInstallEnv strips parent npm lifecycle metadata but preserves useful config", () => {
  const env = {
    PATH: "/usr/bin",
    HOME: "/tmp/home",
    INIT_CWD: "V:\\rezitest2",
    npm_command: "exec",
    npm_execpath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    npm_lifecycle_event: "npx",
    npm_lifecycle_script: "create-rezi my-app",
    npm_config_local_prefix: "V:\\rezitest2",
    npm_package_name: "rezitest2",
    npm_package_json: "V:\\rezitest2\\package.json",
    npm_config_registry: "https://registry.npmjs.org/",
    npm_config_user_agent: "npm/10.8.2 node/v20.19.5 win32 x64 workspaces/false",
  } as const;

  const childEnv = createInstallEnv(env) as NodeJS.ProcessEnv & {
    PATH?: string;
    HOME?: string;
    INIT_CWD?: string;
    npm_command?: string;
    npm_execpath?: string;
    npm_lifecycle_event?: string;
    npm_lifecycle_script?: string;
    npm_config_local_prefix?: string;
    npm_package_name?: string;
    npm_package_json?: string;
    npm_config_registry?: string;
    npm_config_user_agent?: string;
  };

  assert.equal(childEnv.PATH, env.PATH);
  assert.equal(childEnv.HOME, env.HOME);
  assert.equal(childEnv.npm_config_registry, env.npm_config_registry);
  assert.equal(childEnv.npm_config_user_agent, env.npm_config_user_agent);
  assert.equal(childEnv.INIT_CWD, undefined);
  assert.equal(childEnv.npm_command, undefined);
  assert.equal(childEnv.npm_execpath, undefined);
  assert.equal(childEnv.npm_lifecycle_event, undefined);
  assert.equal(childEnv.npm_lifecycle_script, undefined);
  assert.equal(childEnv.npm_config_local_prefix, undefined);
  assert.equal(childEnv.npm_package_name, undefined);
  assert.equal(childEnv.npm_package_json, undefined);
});

test("resolveInstallInvocation prefers npm_execpath and falls back to node-adjacent npm.cmd on Windows", () => {
  assert.deepEqual(
    resolveInstallInvocation("npm", {
      env: {
        npm_execpath: WINDOWS_ROAMING_NPM_EXEC_PATH,
      },
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
    }),
    {
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: [WINDOWS_ROAMING_NPM_EXEC_PATH, "install"],
    },
  );

  assert.deepEqual(
    resolveInstallInvocation("npm", {
      env: {
        npm_execpath:
          "C:\\Users\\example\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs",
      },
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
    }),
    {
      command: "C:\\Program Files\\nodejs\\npm.cmd",
      args: ["install"],
    },
  );

  assert.deepEqual(
    resolveInstallInvocation("npm", {
      env: {},
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
    }),
    {
      command: "C:\\Program Files\\nodejs\\npm.cmd",
      args: ["install"],
    },
  );

  assert.deepEqual(
    resolveInstallInvocation("pnpm", {
      env: {},
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
    }),
    {
      command: "pnpm",
      args: ["install"],
    },
  );
});

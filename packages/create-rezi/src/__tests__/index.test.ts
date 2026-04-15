import { resolve } from "node:path";
import { assert, test } from "@rezi-ui/testkit";
import { createInstallEnv, resolveInstallCwd } from "../index.js";

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

  const childEnv = createInstallEnv(env);

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

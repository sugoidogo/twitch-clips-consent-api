#!/usr/bin/env node

import esbuild from 'esbuild'
import config from './esbuild-config.mjs'
import {spawnSync} from 'node:child_process'

const build = await esbuild.context(config)
await build.watch()
await spawnSync('npx wrangler dev --ip=0.0.0.0', undefined, { shell: true, stdio: 'inherit' })
await build.dispose()
#!/usr/bin/env node

import esbuild from 'esbuild'
import config from './esbuild-config.mjs'

await esbuild.build(config)
#!/usr/bin/env node

import esbuild from 'esbuild'
import config from './esbuild.json' with { type: 'json' }

await esbuild.build(config)
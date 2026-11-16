#!/usr/bin/env node
'use strict';
const { createApp } = require('../src/app.js');
const config = require(process.env.WHEEL_CONFIG || '../config.json');
const app = createApp({ ...config, log: console.error });
app.server.listen(config.port, () => console.log(`wheel API на :${config.port}`));
process.on('SIGINT', () => { app.stop(); process.exit(0); });

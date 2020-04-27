import * as dotenv from 'dotenv';
dotenv.config();

import * as express from 'express';
import * as bodyParser from 'body-parser';
import { JaegerReporter } from './jaeger';
import { ZipkinReporter } from './zipkin';

const app = express();
const server = app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT}`);
});
const jaegerReporter = process.env.JAEGER_COLLECTOR ? new JaegerReporter(process.env.JAEGER_COLLECTOR) : null;
const zipkinReporter = process.env.ZIPKIN_COLLECTOR ? new ZipkinReporter(process.env.ZIPKIN_COLLECTOR) : null;

app.use(bodyParser.json());

app.use('/', express.static('dist'));

app.post('/spans', (req, res) => {
  if (!req.body) return res.sendStatus(400);
  if (!req.body.process) return res.sendStatus(400);
  if (!req.body.process.serviceName) return res.sendStatus(400);
  if (!req.body.spans) return res.sendStatus(400);

  jaegerReporter?.push(req.body);
  zipkinReporter?.push(req.body);

  res.sendStatus(200);
});

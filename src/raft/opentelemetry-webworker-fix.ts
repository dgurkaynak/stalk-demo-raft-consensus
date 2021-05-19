// Opentelemetry.js does not work in webworkers. It depends on either
// `window` object or `global`/`process` object. This is a workaround
// inspired by: https://stackoverflow.com/a/38752760
//
// Why a seperate file? Because webpack hoists all the import statements
// in the output bundle file. So even if we write the following line at the
// top of file, it doesn't work.
if (typeof window != 'object') (self as any).window = self;

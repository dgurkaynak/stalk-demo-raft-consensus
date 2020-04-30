FROM mhart/alpine-node:12.16.3
MAINTAINER Deniz Gurkaynak <dgurkaynak@gmail.com>

WORKDIR /app
ADD . .

RUN npm i && \
  npm run build && \
  rm -rf node_modules && \
  npm i --production

CMD ["npm", "run", "start:backend"]

FROM node:24-slim AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

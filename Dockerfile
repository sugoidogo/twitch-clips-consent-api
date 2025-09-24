FROM jacoblincool/workerd:latest

COPY ./worker.capnp ./worker.capnp

CMD ["serve", "--experimental", "--binary", "worker.capnp"]

LABEL org.opencontainers.image.description="Twitch Clips Consent API https://github.com/sugoidogo/twitch-clips-consent-api"

VOLUME /worker/cache /worker/kv /worker/d1 /worker/r2

EXPOSE 8080/tcp
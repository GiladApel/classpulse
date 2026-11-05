FROM alpine:3.22

ARG PB_VERSION=0.40.6

RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
 && wget -q -O /tmp/checksums.txt "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/checksums.txt" \
 && cd /tmp && grep "pocketbase_${PB_VERSION}_linux_amd64.zip" checksums.txt | sed 's#  .*#  /tmp/pb.zip#' | sha256sum -c - \
 && unzip -q /tmp/pb.zip pocketbase -d /pb && rm /tmp/pb.zip /tmp/checksums.txt \
 && apk del unzip wget

WORKDIR /pb
EXPOSE 8090
# --automigrate=false: settings changed through the API (e.g. OAuth client secret) must not be written to migration files.
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--automigrate=false"]

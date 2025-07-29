# Knight Online Price Scraper

This service scrapes various Knight Online market sites and exposes the data via a small Express API.

## Development

Run the scraper locally using Docker Compose:

```bash
docker-compose up
```

The application listens on port `3000` and uses a Redis instance for caching. The provided `.env` file contains defaults for local development.

### Environment Variables

- `REDIS_URL` – Redis connection string. Railway uses IPv6 addresses so append `?family=0` to enable dual‑stack DNS lookup.
- `UPDATE_INTERVAL` – How often (in minutes) to refresh prices. Defaults to `10`.

When deploying to Railway, create a Redis instance in the same project and add its connection URL as `REDIS_URL` (remember to append `?family=0`).

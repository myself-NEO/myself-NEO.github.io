Twelve questions across every Stage 2 lesson: protocol choices, round-trip arithmetic, real-time transports, edge components and
rate limits — including two designs with a flaw to find. Each answer explains why the other options are wrong.

## How to use this checkpoint

- Answer each question **before** looking at the options when you can — say your reasoning out loud as you would in an interview.
- A wrong first answer is recorded as a mistake in your [revision notebook](#system-design/hld/notebook), with the explanation.
- If you miss two or more questions on the same topic, reread that lesson before moving on — the links are under *Where to review*.

## Questions

```quiz
? True or false: an L4 load balancer can send `/images/*` and `/api/*` to different server pools.
- True
! L4 sees IP addresses and ports only; the path is inside the (often encrypted) HTTP message.
+ False
> Path-based routing needs an L7 component that terminates TLS and parses HTTP.

? A user 120 ms (round trip) away opens a brand-new HTTPS connection using TLS 1.3 over TCP. DNS is cached. When does the first response byte arrive, ignoring server time?
- About 120 ms
! That is the cost on an already-open connection.
- About 240 ms
! That leaves out either the TCP or the TLS handshake.
+ About 360 ms
- About 480 ms
! That is the TLS 1.2 figure (4 round trips).
> TCP (1 RTT) + TLS 1.3 (1 RTT) + request (1 RTT) = 3 × 120 ms.

? You must fail over from a dead region using DNS. The record's TTL is 24 hours. What is the realistic outcome?
- All clients move within a minute
! Cached answers live until their TTL expires.
+ Many clients keep using the dead region for up to a day, so DNS failover is too slow here
- Clients move immediately because health checks override TTLs
! Health checks change future answers, not already-cached ones.
- DNS can't be used for failover at all
! It can, with short TTLs set in advance.
> Records you may need to move should have short TTLs; anycast or a global load balancer avoids cache delay entirely.

? A live sports page pushes score updates to millions of viewers, who only send occasional reactions via normal API calls. Which transport fits best?
+ Server-Sent Events, with HTTP requests for reactions
- WebSockets for everything
! Workable, but two-way messaging and custom reconnect logic add cost without need.
- Short polling every second
! Millions of clients polling every second is millions of requests per second.
- gRPC directly from the browser
! Browsers need gRPC-Web and a proxy; it isn't the natural fit here.
> One-way, high fan-out push over plain HTTP is SSE's sweet spot.

? Find the flaw: "Our 40 WebSocket servers each hold 50,000 connections. Business services send a message to a user by calling a random WebSocket server."
- 50,000 connections per server is impossible
! Well-tuned servers can hold that many connections.
+ A random server almost never holds that user's connection; messages need routing via pub/sub or a user-to-server registry
- WebSockets can't carry messages from server to client
! WebSockets are full duplex.
- They should use UDP instead
! Browsers can't use raw UDP; routing is the issue.
> Persistent connections make servers stateful; route each message to the server holding the connection.

? Estimation: 4 million clients short-poll every 20 seconds. What request rate do they create even when nothing changes?
- 20,000 per second
! That would be every 200 seconds.
+ 200,000 per second
- 800,000 per second
! That would be every 5 seconds.
- 4,000,000 per second
! That would be every second.
> 4,000,000 ÷ 20 s = 200,000 requests per second.

? Sixty app instances, each with a database pool of 20, connect to PostgreSQL configured for 300 connections. What do you recommend?
- Raise each pool to 50 for headroom
! That makes the total even further over the limit.
+ Size pools with Little's law and/or put a pooler such as PgBouncer in front so total connections fit the budget
- Restart instances one at a time
! The arithmetic still doesn't fit: 60 × 20 = 1,200 > 300.
- Switch to UDP connections
! Database protocols run on TCP.
> The fleet-wide total, not one instance's pool, is what must fit the database.

? Bottleneck: after scaling a gRPC service from 6 to 12 instances behind an L4 balancer, the new instances get almost no traffic. Why?
+ Clients keep long-lived HTTP/2 connections, and L4 balances connections, not requests
- gRPC needs sticky sessions
! Stickiness isn't required; connection-level balancing is the cause.
- The balancer uses round robin
! Any connection-level algorithm has this problem with long-lived connections.
- The new instances lack the protobuf files
! They would fail requests, not receive none.
> Use an L7 proxy or client-side balancing to spread individual gRPC calls.

? A CDN serves 60,000 requests per second at a 95% hit ratio. Engineering raises it to 99%. By what factor does origin traffic fall?
- 4%
! The question asks for a factor, and origin traffic falls far more than 4%.
- 2×
! 3,000 to 600 is more than a halving.
+ 5×
- 99×
! Origin traffic is the miss ratio, which goes from 5% to 1%.
> Misses fall from 3,000/s to 600/s — five times less.

? Find the flaw: "The API gateway calculates order discounts, applies loyalty rules, then routes to the orders service."
- The gateway shouldn't route to services
! Routing is a gateway's core job.
+ Business logic in the gateway couples every team to it and turns it into a distributed monolith
- Discounts should be computed in the CDN
! CDNs cache content; they don't run domain logic.
- The gateway needs a WebSocket connection
! Unrelated to the flaw.
> Keep gateways policy-only: auth, limits, routing, validation, observability.

? A login endpoint is rate-limited with counters in Redis. Redis becomes unreachable. Which behaviour is most defensible?
- Fail open silently
! For login, unlimited attempts invite credential-stuffing attacks.
+ Fail closed (or fall back to strict local limits) and alert, because abuse here is costly
- Crash the gateway
! That turns a dependency failure into a full outage.
- Disable authentication
! That removes a necessary control.
> Choose fail-open or fail-closed per endpoint by the cost of abuse versus the cost of rejection.

? Trade-off: which statement about forward and reverse proxies is accurate?
- A CDN is a forward proxy
! A CDN acts for the content owner's servers: a reverse proxy.
+ A reverse proxy acts for servers and can terminate TLS, cache, compress and route; a forward proxy acts for clients
- Reverse proxies can't do load balancing
! Load balancers are specialised reverse proxies.
- Forward proxies hide servers from clients
! That describes a reverse proxy.
> Forward proxies represent clients; reverse proxies (load balancers, gateways, CDNs) represent servers.
```

## Where to review

| If you missed questions about… | Reread |
|---|---|
| L4 vs L7, TCP vs UDP | [OSI, TCP/IP, and TCP vs UDP](lesson:network-layers) |
| TTLs, DNS failover | [DNS: from names to addresses](lesson:dns) |
| Round trips, TLS, HTTP versions | [HTTP, HTTPS & TLS](lesson:http-lifecycle) |
| Pool sizing, fleet-wide connection budgets | [Keep-alive and connection pooling](lesson:connection-management) |
| gRPC, GraphQL, REST trade-offs | [REST vs GraphQL vs gRPC](lesson:rest-graphql-grpc) |
| Polling, SSE, WebSockets, connection tiers | [Long polling, SSE and WebSockets](lesson:realtime-transport) |
| Proxy directions | [Forward and reverse proxies](lesson:proxies) |
| Balancing algorithms, health checks, HTTP/2 pinning | [Load balancers: L4 vs L7](lesson:load-balancers) |
| Hit ratios, freshness, what to cache | [Content delivery networks](lesson:cdn) |
| Gateway responsibilities | [API gateways](lesson:api-gateway) |
| Algorithms, fail-open vs fail-closed | [Rate limiting algorithms](lesson:rate-limiting) |

When you're comfortable with these, continue to [Stage 3: API Design & Data Modeling](lesson:rest-api-design).

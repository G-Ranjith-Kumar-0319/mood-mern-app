# 0007 — MongoDB replica set, no sharding

**Status:** accepted

## Context

The system needs a production-style database that survives the loss of a server. The data volume is
small by design (see ADR 0004).

## Decision

- Use a 3-member replica set (`docker-compose.prod.yml`) with keyFile internal auth and a
  least-privilege application user. Local compose uses a single-node replica set so connection
  semantics match production.
- Do **not** shard. A replica set provides high availability (automatic failover) and durability
  (`w: majority`). Sharding provides write and data-size scaling that this workload does not need, at
  the cost of `mongos` routers, config servers and shard-key design.
- Reads use the primary (read-your-own-writes after saving a detection).

## Revisit when

Sustained write throughput or dataset size exceeds what one replica set's primary can handle, as
shown by monitoring. The candidate shard key is then `{ userId: "hashed" }`, since every query already
includes `userId`.

## Consequences

- Failover was tested: stopping the primary caused an election, and writes continued (retryable writes).
- Three members on one Docker host protect against process failure only. Real HA needs separate machines or zones (for example, Atlas).

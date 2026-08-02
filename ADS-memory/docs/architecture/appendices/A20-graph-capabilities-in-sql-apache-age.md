### A20. Graph Capabilities in SQL (Apache AGE)

**What it is:** Graph query capabilities (Cypher query language, node/edge model) added as an extension to Postgres, enabling graph traversals without a separate graph database.

**Why it matters:** Content relationships, taxonomy hierarchies, permission inheritance, and "users who viewed X also viewed Y" recommendation graphs are naturally modeled as graphs. Apache AGE makes these queries possible in Postgres without a separate Neo4j or similar system.

| Solution | Description |
|---|---|
| Apache AGE | Cypher graph queries in Postgres |
| Kùzu | Embedded graph DB |
| TypeDB | Graph + type system |

**When to use for Tovu:** When content recommendations, internal link graphs, or permission inheritance chains need to be queried with multi-hop traversals. Simpler relationship queries (direct `JOIN`) are fine with standard SQL; the graph extension pays off when query depth is variable (e.g., "find all content reachable within 3 links from this post").

```sql
-- Enable Apache AGE
CREATE EXTENSION IF NOT EXISTS age;
SELECT create_graph('content_graph');

-- Query: recommend content via multi-hop graph traversal
SELECT * FROM cypher('content_graph', $$
  MATCH (start:Content {id: $contentId})

  OPTIONAL MATCH (start)-[:LINKS_TO]->(direct)
  OPTIONAL MATCH (start)-[:IN_CATEGORY]->(cat)<-[:IN_CATEGORY]-(sameCategory)
  OPTIONAL MATCH (start)<-[:VIEWED]-(user)-[:VIEWED]->(alsoViewed)

  WITH COLLECT(DISTINCT direct) +
       COLLECT(DISTINCT sameCategory) +
       COLLECT(DISTINCT alsoViewed) as candidates
  UNWIND candidates as candidate

  RETURN candidate.id, candidate.title, count(*) as score
  ORDER BY score DESC
  LIMIT 10
$$, $params) as (id agtype, title agtype, score agtype);
```

---


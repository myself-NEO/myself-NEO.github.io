"Find restaurants within 2 km", "show drivers near the pickup point", "which delivery zone contains this address" — location queries
are two-dimensional, and ordinary indexes are one-dimensional. Geospatial indexes map 2-D space onto structures a computer can search
quickly: **geohashes**, **quadtrees**, **R-trees**, and cell systems such as **S2** and **H3**. Each makes a different trade between
simplicity, precision and how well it copes with uneven density and movement.

## Why it matters

The naive approach computes the distance from the query point to **every** location — fine for a thousand rows, hopeless for 50 million.

Two separate B-tree indexes don't save you: `lat BETWEEN 12.95 AND 12.99` returns a thin band around the whole planet, and
`lon BETWEEN 77.57 AND 77.61` another; intersecting them still reads far more rows than the small square you wanted
([indexing](lesson:indexing)). What you need is an index where **nearby in space means nearby in the index**.

Proximity questions appear in many interview problems — local business search, ride hailing, delivery, dating, weather — so you need one
default answer and the vocabulary to compare alternatives ([proximity services](lesson:proximity-services)).

## How it works

### Geohash: a grid you can index with a string

A geohash alternately halves the longitude range and the latitude range, recording one bit per halving, and writes every five bits as a
base-32 character. Each character subdivides the parent cell into 32 children, so:

- **A geohash names a rectangular cell**; a longer geohash is a smaller cell inside the shorter one.
- **Points in the same cell share a prefix**, so a B-tree on the geohash string finds a cell's points with a prefix range scan — any
  database, Redis or key-value store can do it.
- **Choose a precision** whose cells are at least as large as the search radius: 6 characters ≈ 1.2 km × 0.6 km, 7 ≈ 150 m.

The catch is the **edge problem**: two points 40 m apart can sit on either side of a cell boundary and share only a short prefix. The fix is
to search the point's cell **and its eight neighbours**, then filter candidates by exact distance (the Java example below shows both).

### Quadtree: cells that adapt to density

A quadtree starts with one square covering the map and **splits a node into four** whenever it holds more than a threshold of points (say
100). Dense city centres end up with tiny cells; empty deserts stay as one big cell. A search descends to the leaves overlapping the query
circle.

- **Adapts to density**, so each leaf holds a bounded number of points — good for "nearest 20 places" anywhere on the map.
- Usually built **in memory** and rebuilt or updated periodically; frequent moves cause splits and merges.

### R-tree: rectangles all the way down

An R-tree groups nearby objects into **bounding rectangles**, and those rectangles into bigger ones, like a B-tree over 2-D boxes. It
indexes **shapes** (polygons, lines), not just points, which makes it the right tool for "which delivery zone contains this address" or
"which parcels intersect this road". PostgreSQL's PostGIS uses R-tree-style GiST indexes.

### S2 and H3: global cell systems

- **S2** (from Google) projects the sphere onto the six faces of a cube and orders cells along a **Hilbert curve**, which keeps nearby cells
  close in ID order. Thirty levels go from a cube face down to about a square centimetre; any region can be approximated by a small set of
  cells (a "covering"), each a 64-bit ID range — easy to index in any key-value store.
- **H3** (from Uber, open-sourced in 2018) tiles the earth with **hexagons** at 16 resolutions. Every hexagon has six neighbours at the same
  distance (a square has eight at two different distances), which makes movement, smoothing and aggregation — demand heat maps, surge
  pricing zones — behave more evenly.

Both avoid the distortion of a latitude/longitude grid near the poles and give stable, hierarchical cell IDs for sharding and aggregation.

### The standard query shape

Whatever the index, a radius search follows the same steps: **cover** the circle with cells, **fetch candidates** from those cells, compute
**exact distances** (haversine), drop those outside the radius, **rank** (by distance, or by distance blended with relevance), and return
the top results.

## Architecture

```mermaid title="Radius search: cover with cells, fetch, filter exactly, rank"
flowchart TB
  Q["Query: lat 12.9716, lon 77.5946,<br/>radius 1 km, 'coffee'"]:::client --> COV
  COV["Cover the circle<br/>cell + 8 neighbours at precision 6"]:::svc
  COV --> IDX[("Geo index<br/>geohash prefix / S2 range / R-tree")]:::db
  IDX --> CAND["Candidates<br/>(a superset of the circle)"]:::svc
  CAND --> EX["Exact haversine distance<br/>drop points beyond 1 km"]:::svc
  EX --> RK["Rank: distance + rating + text match"]:::svc
  RK --> R["Top 20 results"]:::client
```

## Failure scenarios

- **Boundary misses**: querying only the point's own cell drops nearby results across the edge. Always include neighbours.
- **Precision mismatch**: cells far larger than the radius return thousands of candidates to filter; far smaller ones need many cells.
- **Density skew**: a fixed grid puts 50,000 places in one Manhattan cell and none in rural ones; adaptive structures (quadtrees) or
  variable precision fix it.
- **Hot cells**: a stadium or airport cell becomes a hot key for writes and reads ([hot keys](lesson:hot-keys)).
- **Poles and the antimeridian**: rectangular lat/lon cells distort and wrap; global systems (S2, H3) handle them.
- **Moving objects**: re-indexing millions of drivers every few seconds overwhelms disk-based indexes — an in-memory index is usually
  needed.

## Trade-offs

| Index | Strengths | Weaknesses | Typical home |
|---|---|---|---|
| Geohash | Simple string; works in any store with prefix scans | Edge effects; uneven cell area; fixed grid | Redis GEO, DynamoDB, Cassandra |
| Quadtree | Adapts to density; bounded points per leaf | Usually custom and in memory; rebalancing on updates | In-memory services |
| R-tree | Indexes shapes; precise intersection queries | More complex updates | PostGIS, SQLite |
| S2 | Hierarchical, sphere-aware, compact 64-bit IDs, regions as cell ranges | Cells are quadrilaterals of varying shape | Google services, custom systems |
| H3 | Uniform neighbours, good for aggregation and movement | Hexagons don't nest perfectly; approximate containment | Ride hailing, logistics analytics |

## In real systems

- **Redis GEO** stores each point in a sorted set with a 52-bit geohash as its score; `GEOSEARCH` scans the covering cells and filters by
  distance ([Redis beyond caching](lesson:redis-beyond-cache)).
- **PostGIS** adds `geography` types and `ST_DWithin(location, point, 2000)` backed by a GiST index — the default when locations live in
  PostgreSQL and change rarely.
- **Elasticsearch** indexes `geo_point` fields with Lucene's block k-d trees and combines `geo_distance` filters with text relevance
  ([Elasticsearch](lesson:elasticsearch)).
- **Uber** built H3 for marketplace analysis such as pricing and supply positioning; **Google** uses S2 across mapping products.

## Java and Spring Boot example

Geohash encoding, cell sizes at each precision, and the edge problem, in plain Java. Point A and point B are 43 m apart but fall in
different precision-6 cells; searching A's cell plus its eight neighbours finds B.

```java file="Geohash.java"
import java.util.ArrayList;
import java.util.List;

// Geohash: interleave longitude and latitude bits, write them in base 32. Shows cell sizes,
// the 3x3 neighbour search, and two close points whose geohashes share no long prefix.
public class Geohash {
    static final String BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    static String encode(double lat, double lon, int precision) {
        double[] latR = {-90, 90}, lonR = {-180, 180};
        StringBuilder hash = new StringBuilder();
        boolean even = true;                           // even bits refine longitude
        int bits = 0, ch = 0;
        while (hash.length() < precision) {
            double[] r = even ? lonR : latR;
            double v = even ? lon : lat, mid = (r[0] + r[1]) / 2;
            ch <<= 1;
            if (v >= mid) { ch |= 1; r[0] = mid; } else { r[1] = mid; }
            even = !even;
            if (++bits == 5) { hash.append(BASE32.charAt(ch)); bits = 0; ch = 0; }
        }
        return hash.toString();
    }

    static double[] bounds(String hash) {             // {minLat, maxLat, minLon, maxLon}
        double[] latR = {-90, 90}, lonR = {-180, 180};
        boolean even = true;
        for (char c : hash.toCharArray()) {
            int idx = BASE32.indexOf(c);
            for (int b = 4; b >= 0; b--) {
                double[] r = even ? lonR : latR;
                double mid = (r[0] + r[1]) / 2;
                if (((idx >> b) & 1) == 1) r[0] = mid; else r[1] = mid;
                even = !even;
            }
        }
        return new double[] {latR[0], latR[1], lonR[0], lonR[1]};
    }

    static double metres(double lat1, double lon1, double lat2, double lon2) {   // haversine
        double r = 6_371_000;
        double dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(Math.toRadians(lat1))
                * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLon / 2), 2);
        return 2 * r * Math.asin(Math.sqrt(a));
    }

    static List<String> cellAndNeighbours(double lat, double lon, int precision) {
        double[] b = bounds(encode(lat, lon, precision));
        double h = b[1] - b[0], w = b[3] - b[2];
        List<String> cells = new ArrayList<>();
        for (int dy = 1; dy >= -1; dy--)
            for (int dx = -1; dx <= 1; dx++)
                cells.add(encode(lat + dy * h, lon + dx * w, precision));
        return cells;
    }

    public static void main(String[] args) {
        double lat = 12.9716, lon = 77.5946;                   // central Bengaluru
        System.out.println("precision  geohash     cell size (approx.)");
        for (int p = 4; p <= 8; p++) {
            double[] b = bounds(encode(lat, lon, p));
            double hM = metres(b[0], b[2], b[1], b[2]), wM = metres(b[0], b[2], b[0], b[3]);
            System.out.printf("%5d      %-10s  %,8.0f m x %,8.0f m%n",
                    p, encode(lat, lon, p), wM, hM);
        }

        double[] cell = bounds(encode(lat, lon, 6));
        double eastLon = cell[3] + 0.0002;                     // just across the cell's east edge
        double westLon = cell[3] - 0.0002;
        System.out.printf("%nA %s and B %s are %.0f m apart%n", encode(lat, westLon, 9),
                encode(lat, eastLon, 9), metres(lat, westLon, lat, eastLon));
        System.out.println("so a prefix search on A's cell alone would miss B.");

        List<String> nine = cellAndNeighbours(lat, westLon, 6);
        System.out.println("\nsearch the cell and its 8 neighbours:");
        for (int row = 0; row < 3; row++)
            System.out.println("  " + String.join("  ", nine.subList(row * 3, row * 3 + 3)));
        System.out.println("B's cell " + encode(lat, eastLon, 6) + " is included: "
                + nine.contains(encode(lat, eastLon, 6)));
    }
}
```

```text title="Output" output="Geohash.java"
precision  geohash     cell size (approx.)
    4      tdr1          38,116 m x   19,546 m
    5      tdr1v          4,762 m x    4,886 m
    6      tdr1v9         1,190 m x      611 m
    7      tdr1v9q          149 m x      153 m
    8      tdr1v9qt          37 m x       19 m

A tdr1v9rv5 and B tdr1vc2jh are 43 m apart
so a prefix search on A's cell alone would miss B.

search the cell and its 8 neighbours:
  tdr1v6  tdr1vd  tdr1vf
  tdr1v3  tdr1v9  tdr1vc
  tdr1v2  tdr1v8  tdr1vb
B's cell tdr1vc is included: true
```

Cells are close to square at precision 5 and 7 and twice as wide as tall at even precisions, because geohash alternates longitude and
latitude bits.

## Common mistakes

- **Separate B-tree indexes on latitude and longitude** as the "geo index".
- **Querying only the containing cell**, missing neighbours across edges.
- **Ranking by cell** instead of exact distance — cells are coarse.
- **Disk-based indexes for objects that move every few seconds** without considering write volume.
- **One fixed precision everywhere** despite huge density differences.
- **Forgetting that distance on a sphere isn't Euclidean** at large radii (use haversine or a geography type).

## In the interview

Default answer: *"Store places in PostGIS (or Elasticsearch if search text matters) with a geo index; for moving drivers keep positions in
Redis GEO or an in-memory geohash/H3 grid, sharded by region. Query the cell and its neighbours, filter by exact distance, then rank."*

````question title="How would you find the 20 nearest restaurants to a user?"
Index restaurants by location — PostGIS with a GiST index, Elasticsearch geo_point, or geohash strings in a key-value store. At query time,
choose a precision whose cells roughly match the expected radius, fetch candidates from the user's cell and its eight neighbours, compute
exact distances, and keep the nearest 20 (expanding the radius or lowering precision if too few results). Restaurants rarely move, so the
index can be updated asynchronously and cached heavily.
````

````question title="Geohash or quadtree — which would you choose?"
Geohash when I want simplicity and to reuse an existing store: the geohash is just an indexed string, prefix scans find cells, and Redis
supports it natively. A quadtree when density varies enormously and I want each leaf to hold a bounded number of points, typically in an
in-memory service rebuilt periodically. For moving objects at scale, I'd also consider H3 or S2 cell IDs as shard keys with in-memory
indexes per cell.
````

````question title="Why does Uber's H3 use hexagons?"
Every hexagon has six neighbours whose centres are all the same distance away, while a square grid has edge neighbours and corner neighbours
at different distances. Uniform neighbourhoods make operations like smoothing demand, computing rings of nearby cells, and modelling
movement behave consistently, which suits marketplace analytics such as supply, demand and pricing zones.
````

## Key takeaways

- 2-D queries need indexes where **spatial proximity becomes index proximity**.
- **Geohash**: prefix = cell; search the cell **plus 8 neighbours**, then filter by exact distance.
- **Quadtrees** adapt to density; **R-trees** index shapes; **S2** and **H3** give global, hierarchical cell IDs (hexagons for H3).
- Pick by workload: PostGIS for static places in PostgreSQL, Elasticsearch for geo plus text, Redis GEO or in-memory grids for moving objects.

## Knowledge check

```quiz
? A service finds nearby shops by querying only the geohash cell containing the user. Users near cell edges complain about missing shops. Why?
+ Shops a few metres away can be in a neighbouring cell with a different prefix; the query must include the 8 neighbouring cells
- Geohash precision is too high everywhere
! Even with the right precision, edges cause misses.
- The haversine formula is wrong near edges
! Distance calculation isn't the issue.
- Geohashes only work at the equator
! They work everywhere, with distortion near poles.
> Search the cell and its neighbours, then filter by exact distance.

? Which index fits "which delivery zone polygon contains this address?" best?
- Geohash prefix scan
! Points, not polygons.
+ An R-tree-style spatial index such as PostGIS GiST
- A B-tree on zone name
! Doesn't index geometry.
- An inverted index
! Text, not shapes.
> R-trees index bounding rectangles of shapes.

? City centres have 100x the density of suburbs, and a fixed geohash grid returns either too many or too few candidates. What helps?
- Increase the radius everywhere
! That makes dense areas worse.
+ An adaptive structure such as a quadtree, or choosing precision per area based on density
- Store latitude and longitude in separate indexes
! That's worse than a grid.
- Use H3 at a single resolution
! A single resolution is still a fixed grid.
> Adapt cell size to density.

? Why compute exact distances after fetching cells?
- Cells are always exact circles
! Cells are rectangles or hexagons.
+ Cells cover a superset of the circle, so some candidates lie outside the radius and the order within a cell isn't by distance
- To convert to kilometres
! Units aren't the reason.
- Because geohashes are encrypted
! They're just encodings.
> The index narrows candidates; exact math decides.
```

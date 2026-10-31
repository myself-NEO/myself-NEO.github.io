## Problem statement

Build the core of a "trending terms" feature in `WordFrequency`:

1. **`static Map<String, Long> count(String text)`** counts words, case-insensitively.
   - A word is a run of Unicode letters or digits, optionally containing inner apostrophes (`don't`, `it's`).
   - Everything else separates words.
   - Words are lower-cased with `Locale.ROOT`.
2. **`static List<WordCount> topKStreams(String text, int k)`** returns the `k` most frequent words using the **Streams API**.
3. **`static List<WordCount> topKHeap(String text, int k)`** returns the same result using a **bounded `PriorityQueue`**, in O(n log k).

where `record WordCount(String word, long count)`.

**Ordering**: higher counts first, and **ties broken alphabetically** so the result is deterministic. Both methods must return exactly the same list.

**Rules**:
- `k == 0` → empty list;
- `k < 0` → `IllegalArgumentException`;
- `k` larger than the number of distinct words → all words, in order;
- blank text → empty results.

## Starter code

```java title="WordFrequency.java" starter="true"
import java.util.List;
import java.util.Map;

public final class WordFrequency {
    record WordCount(String word, long count) { }

    private WordFrequency() { }

    static Map<String, Long> count(String text) {
        return Map.of();                           // TODO
    }

    static List<WordCount> topKStreams(String text, int k) {
        return List.of();                          // TODO
    }

    static List<WordCount> topKHeap(String text, int k) {
        return List.of();                          // TODO
    }

    public static void main(String[] args) {
        String text = "It was the best of times, it was the worst of times; it was the age of wisdom, "
                + "it was the age of foolishness. Don't panic: it's only a test, and IT'S fine!";
        System.out.println("distinct words: " + count(text).size() + ", total words: "
                + count(text).values().stream().mapToLong(Long::longValue).sum());
        System.out.println("count(\"Don't\"), count(\"it's\"): " + count(text).get("don't") + ", " + count(text).get("it's"));
        System.out.println("top 5 (streams): " + topKStreams(text, 5));
        System.out.println("top 5 (heap):    " + topKHeap(text, 5));
        System.out.println("same result: " + topKStreams(text, 5).equals(topKHeap(text, 5)));
        System.out.println("ties broken alphabetically, top 3 of \"b a c b a c\": " + topKHeap("b a c b a c", 3));
        System.out.println("k larger than distinct words: " + topKStreams("one two two", 10));
        System.out.println("k = 0: " + topKHeap(text, 0) + ", blank text: " + topKStreams("  ...  ", 3));
        try {
            topKHeap(text, -1);
        } catch (IllegalArgumentException e) {
            System.out.println("k = -1: IllegalArgumentException: " + e.getMessage());
        }
    }
}
```

## Hints

````hint title="Hint 1: tokenising"
Splitting on spaces leaves punctuation attached (`"times,"`). Match words instead of splitting:

```java
Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]+(?:'[\\p{L}\\p{N}]+)*");
Matcher m = WORD.matcher(text.toLowerCase(Locale.ROOT));
while (m.find()) { ... m.group() ... }
```

Or use `WORD.matcher(...).results().map(MatchResult::group)` to get a stream. Precompile the pattern in a `static final` field.
````

````hint title="Hint 2: counting and sorting with streams"
Count with `Collectors.groupingBy(Function.identity(), Collectors.counting())`. Then stream the `entrySet()` and sort with:

```java
Comparator.comparing((Map.Entry<String, Long> e) -> e.getValue()).reversed()
        .thenComparing(Map.Entry::getKey)
```

Then `limit(k)`. Build the descending-count comparator carefully: `.reversed()` applies to everything chained **before** it.
````

````hint title="Hint 3: the bounded heap"
Keep a **min-heap of the best k seen so far**, ordered so the *worst* candidate is at the top:
- lowest count first;
- for equal counts, the alphabetically **later** word first, because it's worse.

Offer every entry, and `poll()` whenever the size exceeds `k`. At the end, poll everything (worst to best) and reverse. That's O(n log k), and the heap never holds more than k + 1 entries.
````

## Test cases

| Input | Expected |
|---|---|
| `count("It was... IT'S fine!")` | `it` counted case-insensitively; `don't` and `it's` kept as words |
| `topK(text, 5)` (streams and heap) | `[WordCount[word=it, count=4], WordCount[word=of, count=4], WordCount[word=the, count=4], WordCount[word=was, count=4], WordCount[word=age, count=2]]` |
| `topKHeap("b a c b a c", 3)` | `a=2, b=2, c=2`, in alphabetical order |
| `topKStreams("one two two", 10)` | `[two=2, one=1]` |
| `k = 0` | `[]` |
| Blank or punctuation-only text | `[]` |
| `k = -1` | `IllegalArgumentException` |
| 10,000 generated words | streams and heap results identical |

## Expected output

```text title="Expected output" output="WordFrequency.java"
distinct words: 18, total words: 33
count("Don't"), count("it's"): 1, 2
top 5 (streams): [WordCount[word=it, count=4], WordCount[word=of, count=4], WordCount[word=the, count=4], WordCount[word=was, count=4], WordCount[word=age, count=2]]
top 5 (heap):    [WordCount[word=it, count=4], WordCount[word=of, count=4], WordCount[word=the, count=4], WordCount[word=was, count=4], WordCount[word=age, count=2]]
same result: true
ties broken alphabetically, top 3 of "b a c b a c": [WordCount[word=a, count=2], WordCount[word=b, count=2], WordCount[word=c, count=2]]
k larger than distinct words: [WordCount[word=two, count=2], WordCount[word=one, count=1]]
k = 0: [], blank text: []
k = -1: IllegalArgumentException: k must not be negative: -1
```

## Reference solution

````solution title="Reference solution (WordFrequency.java)"
```java title="WordFrequency.java" file="WordFrequency.java"
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.function.Function;
import java.util.regex.MatchResult;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public final class WordFrequency {
    record WordCount(String word, long count) { }

    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{N}]+(?:'[\\p{L}\\p{N}]+)*");

    /** Best first: higher count, then alphabetical. */
    static final Comparator<WordCount> BEST_FIRST =
            Comparator.comparingLong(WordCount::count).reversed().thenComparing(WordCount::word);

    private WordFrequency() { }

    static Map<String, Long> count(String text) {
        return WORD.matcher(text.toLowerCase(Locale.ROOT)).results()
                .map(MatchResult::group)
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
    }

    private static void checkK(int k) {
        if (k < 0) {
            throw new IllegalArgumentException("k must not be negative: " + k);
        }
    }

    static List<WordCount> topKStreams(String text, int k) {
        checkK(k);
        return count(text).entrySet().stream()
                .map(e -> new WordCount(e.getKey(), e.getValue()))
                .sorted(BEST_FIRST)
                .limit(k)
                .toList();
    }

    static List<WordCount> topKHeap(String text, int k) {
        checkK(k);
        if (k == 0) {
            return List.of();
        }
        PriorityQueue<WordCount> worstOnTop = new PriorityQueue<>(BEST_FIRST.reversed());
        for (Map.Entry<String, Long> e : count(text).entrySet()) {
            worstOnTop.offer(new WordCount(e.getKey(), e.getValue()));
            if (worstOnTop.size() > k) {
                worstOnTop.poll();                       // evict the worst of the k + 1
            }
        }
        List<WordCount> result = new ArrayList<>(worstOnTop.size());
        while (!worstOnTop.isEmpty()) {
            result.add(worstOnTop.poll());               // worst to best
        }
        Collections.reverse(result);
        return result;
    }

    public static void main(String[] args) {
        String text = "It was the best of times, it was the worst of times; it was the age of wisdom, "
                + "it was the age of foolishness. Don't panic: it's only a test, and IT'S fine!";
        System.out.println("distinct words: " + count(text).size() + ", total words: "
                + count(text).values().stream().mapToLong(Long::longValue).sum());
        System.out.println("count(\"Don't\"), count(\"it's\"): " + count(text).get("don't") + ", " + count(text).get("it's"));
        System.out.println("top 5 (streams): " + topKStreams(text, 5));
        System.out.println("top 5 (heap):    " + topKHeap(text, 5));
        System.out.println("same result: " + topKStreams(text, 5).equals(topKHeap(text, 5)));
        System.out.println("ties broken alphabetically, top 3 of \"b a c b a c\": " + topKHeap("b a c b a c", 3));
        System.out.println("k larger than distinct words: " + topKStreams("one two two", 10));
        System.out.println("k = 0: " + topKHeap(text, 0) + ", blank text: " + topKStreams("  ...  ", 3));
        try {
            topKHeap(text, -1);
        } catch (IllegalArgumentException e) {
            System.out.println("k = -1: IllegalArgumentException: " + e.getMessage());
        }
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
1. **Tokenise by matching words, not by splitting.**
   - The regex `[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*` accepts letters and digits in any script, plus inner apostrophes, so `don't` stays one word while `'quoted'` loses its quotes.
   - Lower-casing with `Locale.ROOT` makes `IT'S` and `it's` the same word on every machine.
   - The pattern is compiled once (`static final`); recompiling it per call is a common hidden cost.
2. **Count** with `groupingBy(identity(), counting())`, a single pass producing `Map<String, Long>`. The map's iteration order is unspecified, which is why the next step must define a total order.
3. **Define one comparator** for "best first": count descending, then word ascending. Because it's a *total* order (no two distinct words compare equal), both implementations must produce exactly the same list. This tie-break is what makes the output deterministic and testable.
4. **The streams version**: sort all m distinct words in O(m log m), then `limit(k)`. Simple and readable, which makes it the right default when m is moderate.
5. **The heap version** keeps only the k best candidates:
   - the heap is ordered by the **reversed** comparator, so its root is the worst of the current candidates;
   - after each `offer`, if there are k + 1 elements, `poll()` removes the worst;
   - that's O(m log k) time and O(k) extra space, which matters when m is huge and k is small (top 10 of 10 million terms);
   - polling yields worst to best, hence the final reverse.
6. **Validation and edge cases**: negative `k` is a caller bug (`IllegalArgumentException`). `k == 0` short-circuits, because a size-0 heap would evict everything anyway. Text with no words produces an empty map, and therefore empty results.
````

## Edge cases

- **Ties at the boundary**: if positions k and k + 1 have the same count, the alphabetical tie-break decides deterministically. Without it, results would change from run to run as `HashMap` iteration order changes.
- **Case and locale**: `toLowerCase()` without a locale breaks in Turkish locales (`I` → `ı`). Use `Locale.ROOT` for identifiers.
- **Unicode words**: `\p{L}` matches accented and non-Latin letters (`café`, `München`, Cyrillic). Note that `\w` in Java is ASCII-only unless `UNICODE_CHARACTER_SET` is set.
- **Very large inputs**: read line by line (`Files.lines`) and accumulate with `merge(word, 1L, Long::sum)` instead of materialising the whole text. For distributed data, count per partition and merge the maps.
- **Stop words** ("the", "of") dominate natural text. Real trending systems filter them out and normalise plurals (stemming).
- **Apostrophe variants**: `’` (U+2019) isn't `'`. Normalise typographic quotes first if the input comes from word processors.

## JUnit tests

```java title="WordFrequencyTest.java" file="WordFrequencyTest.java" test="WordFrequency.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;

class WordFrequencyTest {
    private static final String TEXT = "It was the best of times, it was the worst of times; it was the age of wisdom, "
            + "it was the age of foolishness. Don't panic: it's only a test, and IT'S fine!";

    @Test
    void countsCaseInsensitivelyAndKeepsApostrophes() {
        Map<String, Long> counts = WordFrequency.count(TEXT);
        assertEquals(4L, counts.get("it"));
        assertEquals(2L, counts.get("it's"));
        assertEquals(1L, counts.get("don't"));
        assertEquals(2L, counts.get("times"));
        assertTrue(counts.keySet().stream().allMatch(w -> w.equals(w.toLowerCase())));
    }

    @Test
    void topFiveWithAlphabeticalTieBreak() {
        List<WordFrequency.WordCount> expected = List.of(
                new WordFrequency.WordCount("it", 4), new WordFrequency.WordCount("of", 4),
                new WordFrequency.WordCount("the", 4), new WordFrequency.WordCount("was", 4),
                new WordFrequency.WordCount("age", 2));
        assertEquals(expected, WordFrequency.topKStreams(TEXT, 5));
        assertEquals(expected, WordFrequency.topKHeap(TEXT, 5));
    }

    @Test
    void allTiesAreAlphabetical() {
        List<WordFrequency.WordCount> expected = List.of(new WordFrequency.WordCount("a", 2),
                new WordFrequency.WordCount("b", 2), new WordFrequency.WordCount("c", 2));
        assertEquals(expected, WordFrequency.topKHeap("c b a c b a", 3));
        assertEquals(expected, WordFrequency.topKStreams("c b a c b a", 3));
        assertEquals(expected.subList(0, 2), WordFrequency.topKHeap("c b a c b a", 2));
    }

    @Test
    void kLargerThanDistinctReturnsEverything() {
        List<WordFrequency.WordCount> expected = List.of(new WordFrequency.WordCount("two", 2), new WordFrequency.WordCount("one", 1));
        assertEquals(expected, WordFrequency.topKStreams("one two two", 10));
        assertEquals(expected, WordFrequency.topKHeap("one two two", 10));
    }

    @Test
    void zeroKBlankTextAndNegativeK() {
        assertEquals(List.of(), WordFrequency.topKHeap(TEXT, 0));
        assertEquals(List.of(), WordFrequency.topKStreams(TEXT, 0));
        assertEquals(List.of(), WordFrequency.topKHeap("  ... !! ", 3));
        assertThrows(IllegalArgumentException.class, () -> WordFrequency.topKHeap(TEXT, -1));
        assertThrows(IllegalArgumentException.class, () -> WordFrequency.topKStreams(TEXT, -1));
    }

    @Test
    void heapAndStreamsAgreeOnLargeRandomText() {
        Random random = new Random(42);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 10_000; i++) {
            sb.append("w").append((int) Math.abs(random.nextGaussian() * 40)).append(i % 7 == 0 ? ", " : " ");
        }
        String text = sb.toString();
        for (int k : new int[] { 1, 5, 17, 100 }) {
            assertEquals(WordFrequency.topKStreams(text, k), WordFrequency.topKHeap(text, k), "k=" + k);
        }
    }
}
```

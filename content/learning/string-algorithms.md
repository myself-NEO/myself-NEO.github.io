# String Algorithms — From Scratch to Advanced

A complete, self-contained deep dive for Java interviews.

**How to use this file:** Part 0 covers how Java strings behave and maps every family of string question
to the right tool. Part 1 is pattern matching: the naive algorithm, the prefix function and KMP, the
Z-function, Rabin–Karp and substring hashing. Part 2 covers palindromes: two pointers, expanding around
centers, Manacher's algorithm and partitioning. Part 3 covers suffix arrays with LCP. Part 4 has the
recognition table, the edge cases, the practice ladder and the one-page summary.

Sliding windows, anagrams and two-pointer string problems are in the *Arrays & Strings* guide; edit
distance and longest common subsequence are in *Dynamic Programming*; prefix trees and Aho–Corasick
are in *Tries*.

Every solution below compiles and passes randomised tests against brute-force references.
Problem numbers like **LC 28** refer to LeetCode.

---

## Table of Contents

**[Part 0 — The mental model](#part-0--the-mental-model)**

**[Part 1 — Pattern matching](#part-1--pattern-matching)**
1. [The naive algorithm](#11-the-naive-algorithm-and-why-its-slow)
2. [The prefix function](#12-the-prefix-function)
3. [KMP search](#13-kmp-search)
4. [What the prefix function tells you](#14-what-the-prefix-function-tells-you)
5. [The Z-function](#15-the-z-function)
6. [Rabin–Karp](#16-rabinkarp-rolling-hashes)
7. [Substring hashing](#17-substring-hashing)
8. [Binary search + hashing](#18-binary-search--hashing-longest-duplicate-substring-)

**[Part 2 — Palindromes](#part-2--palindromes)**
1. [Two pointers](#21-two-pointers-checking-a-palindrome)
2. [Expand around the center](#22-expand-around-the-center-)
3. [Manacher's algorithm](#23-manachers-algorithm)
4. [Palindrome partitioning](#24-palindrome-partitioning)

**[Part 3 — Suffix structures](#part-3--suffix-structures)**
1. [Suffix arrays and LCP](#31-suffix-arrays-and-lcp)
2. [Choosing a structure](#32-choosing-a-structure)

**[Part 4 — Solving any string question](#part-4--solving-any-string-question)**

---

# Part 0 — The Mental Model

**Java strings are immutable.** Every "modification" creates a new string, so the costs are not always
what they look like:

```java
static void javaStrings() {
    String s = "interview";
    char c = s.charAt(0);                      // 'i'
    int idx = c - 'a';                         // 8: the letter's slot in an int[26] count
    char back = (char) ('a' + idx);            // 'i' again
    String sub = s.substring(2, 5);            // "ter": [begin, end), a NEW string, O(length)
    boolean same = sub.equals("ter");          // true. == compares references: never use it here
    int order = "apple".compareTo("banana");   // < 0: lexicographic order
    String joined = String.join(",", List.of("a", "b", "c"));   // "a,b,c"
    String[] parts = "a.b.c".split("\\.");     // split takes a REGEX: a bare "." matches everything
    String repeated = "ab".repeat(3);          // "ababab" (Java 11+)
    char[] chars = s.toCharArray();            // a mutable copy; sorted, it's an anagram key
    Arrays.sort(chars);
    String key = new String(chars);            // "eeiinrtvw"
    StringBuilder sb = new StringBuilder();    // build strings in loops with this, never with +=
    for (int i = 0; i < 3; i++) sb.append(i);
    String built = sb.reverse().toString();    // "210"
}
```

| Operation | Cost | Watch out for |
|---|---|---|
| `charAt(i)`, `length()` | O(1) | — |
| `substring(a, b)` | O(b − a): it copies | calling it inside a loop that only needs indexes |
| `s1 + s2`, `+=` | O(total length) | `+=` in a loop is O(n²): use `StringBuilder` |
| `equals`, `compareTo` | O(length) | `==` compares references, not contents |
| `indexOf(pattern)` | O(n · m) in the worst case | it's the naive algorithm (1.1), not KMP |
| `split(regex)` | O(n), plus regex compilation | `.`, `\|`, `+`, `*` are regex symbols: escape them |
| `hashCode()` | O(n) the first time, then cached | — |

**Where string questions live:**

| Family | Typical problems | Where |
|---|---|---|
| windows and counts | longest substring without repeats, minimum window, anagrams | *Arrays & Strings* guide |
| matching and periodicity | find a pattern, repeated patterns, borders | Part 1 |
| palindromes | longest, count, partition, fix with deletions | Part 2 |
| all substrings of one string | distinct substrings, longest repeat | Part 3 (and 1.8) |
| comparing two strings | edit distance, LCS, interleaving | *Dynamic Programming* guide |
| many words or patterns | autocomplete, word search, many patterns in one text | *Tries* guide |

**The algorithm map:**

| Algorithm | Answers | Time |
|---|---|---|
| naive matching | the first or every occurrence | O(n · m) worst case |
| KMP (prefix function) | every occurrence, borders, periods | O(n + m) |
| Z-function | every occurrence, how far each position matches the prefix | O(n + m) |
| Rabin–Karp | occurrences; many patterns of one length | O(n + m) expected |
| prefix hashes | compare any two substrings | O(n) setup, O(1) per query |
| Manacher | the longest palindrome at every center | O(n) |
| suffix array + LCP | sorted suffixes, distinct substrings, longest repeat | O(n log² n) + O(n) |

One idea ties Part 1 together: **reuse what you've already matched.** The naive algorithm forgets everything
after a mismatch. KMP remembers borders, the Z-function remembers a box, and hashing remembers a number.

---

# Part 1 — Pattern Matching

## 1.1 The naive algorithm (and why it's slow)

```java
// Brute-force matching: try every alignment. O(n * m)
// in the worst case, e.g. "aaaa...a" against "aaab".
static int naiveIndexOf(String text, String pattern) {
    int n = text.length(), m = pattern.length();
    for (int i = 0; i + m <= n; i++) {
        int j = 0;
        while (j < m && text.charAt(i + j) == pattern.charAt(j)) j++;
        if (j == m) return i;
    }
    return -1;
}
```

```text
text      a a a a a a a a b
pattern   a a a b
          a a a x              3 matches, then a mismatch at alignment 0
            a a a x            slide by one and compare the same a's again
              a a a x          ... O(n * m) comparisons in total
```

`String.indexOf` works this way too. It's fine for short patterns, and many interviewers accept it for
LC 28 unless they ask for linear time. If they do, use KMP or Z, and don't claim `indexOf` is O(n + m).

## 1.2 The prefix function

A **border** of a string is a proper prefix that is also a suffix: "aba" is a border of "ababa". The prefix
function stores, for every position, the longest border of the string up to there.

```text
s     a  b  a  b  a  c  a  b  a
i     0  1  2  3  4  5  6  7  8
pi    0  0  1  2  3  0  1  2  3       pi[4] = 3: "aba" is both a prefix and a suffix of "ababa"
```

```java
// pi[i] = the length of the longest PROPER prefix of
// s[0..i] that is also a suffix of s[0..i]. O(n).
static int[] prefixFunction(String s) {
    int n = s.length();
    int[] pi = new int[n];
    for (int i = 1; i < n; i++) {
        // try to extend the previous border
        int k = pi[i - 1];
        // fall back to the next shorter border
        while (k > 0 && s.charAt(i) != s.charAt(k)) k = pi[k - 1];
        if (s.charAt(i) == s.charAt(k)) k++;
        pi[i] = k;
    }
    return pi;
}
```

- **The fallback:** if the border of length k can't be extended by `s[i]`, the next candidate is the longest
  border *of that border*, `pi[k − 1]`, because the borders of a border are exactly the shorter borders.
- **Why it's O(n):** `k` grows by at most 1 per step, and every fallback shrinks it. So there are at most n
  fallbacks in total.

## 1.3 KMP search

```java
// KMP: every start index of a non-empty pattern in
// text, O(n + m). The text pointer never moves back.
static List<Integer> kmpSearch(String text, String pattern) {
    int[] pi = prefixFunction(pattern);
    List<Integer> matches = new ArrayList<>();
    int k = 0;                                       // how many pattern characters match right now
    for (int i = 0; i < text.length(); i++) {
        while (k > 0 && text.charAt(i) != pattern.charAt(k)) k = pi[k - 1];
        if (text.charAt(i) == pattern.charAt(k)) k++;
        if (k == pattern.length()) {                 // a full match ends at i
            matches.add(i - k + 1);
            k = pi[k - 1];                           // keep going: matches may overlap
        }
    }
    return matches;
}
```

- It's the same loop as the prefix function, run over the text. `k` is how much of the pattern matches the
  text ending at `i`. On a mismatch, KMP falls back along the *pattern's* borders and never moves the text
  pointer backwards. That also makes it work on a stream.
- After a full match, continue from `pi[k − 1]`, not from 0, or overlapping matches ("aa" in "aaa") are lost.
- An equivalent trick: compute `prefixFunction(pattern + "#" + text)`. Every position where `pi` equals m is
  the end of a match. The separator must not occur in either string.
- **LC 28 Find the Index of the First Occurrence:** return the first match, or −1.

## 1.4 What the prefix function tells you

```java
// LC 459 Repeated Substring Pattern: the shortest period of s is n - pi[n-1]. s is a repetition of
// a block exactly when that period is shorter than s and divides its length.
public boolean repeatedSubstringPattern(String s) {
    int n = s.length(), period = n - prefixFunction(s)[n - 1];
    return period < n && n % period == 0;
}

// LC 1392 Longest Happy Prefix: the longest proper
// prefix that is also a suffix is pi[n-1] by definition.
public String longestPrefix(String s) {
    return s.substring(0, prefixFunction(s)[s.length() - 1]);
}

// LC 214 Shortest Palindrome: add the fewest characters IN FRONT. Keep the
// longest palindromic prefix, which is the longest prefix of s that is also a
// suffix of reverse(s). '#' stops a border that would run across the middle.
public String shortestPalindrome(String s) {
    String rev = new StringBuilder(s).reverse().toString();
    int[] pi = prefixFunction(s + "#" + rev);
    int keep = pi[pi.length - 1];                // s[0, keep) is a palindrome
    return rev.substring(0, s.length() - keep) + s;
}

// LC 686 Repeated String Match: q = ceil(|b| / |a|) copies are needed; q + 1 copies always suffice.
public int repeatedStringMatch(String a, String b) {
    int q = (b.length() + a.length() - 1) / a.length();
    List<Integer> hits = kmpSearch(a.repeat(q + 1), b);
    if (hits.isEmpty()) return -1;
    return hits.get(0) + b.length() <= q * a.length() ? q : q + 1;
}
```

**The period.** The shortest period of s is `p = n − pi[n − 1]`, meaning `s[i] = s[i + p]` wherever both
exist. The string is a whole number of repetitions exactly when p divides n:

```text
s = abcabcabc    pi[n-1] = 6    period = 9 - 6 = 3    9 % 3 == 0  -> "abc" three times
s = abcabcab     pi[n-1] = 5    period = 8 - 5 = 3    8 % 3 != 0  -> not a whole repetition
```

**The shortest palindrome.** In `s + "#" + reverse(s)`, the final `pi` value is the longest prefix of s that
equals a suffix of reverse(s), which is the longest palindromic prefix of s. Reverse whatever is left over
and put it in front:

```text
s = aacecaaa     reverse = aaacecaa     longest palindromic prefix = aacecaa (7 characters)
answer = reverse[0, 8 - 7) + s = "a" + "aacecaaa" = "aaacecaaa"
```

**Repeated String Match.** An occurrence of b can always be shifted to start inside the first copy of a, so
`q = ⌈|b| / |a|⌉` copies are needed and `q + 1` copies always suffice. Search once in q + 1 copies and check
where the first match ends.

## 1.5 The Z-function

`z[i]` is the length of the longest common prefix of s and the suffix starting at i:

```text
s     a  a  b  x  a  a  b
i     0  1  2  3  4  5  6
z     7  1  0  0  3  1  0        z[4] = 3: "aab" at position 4 matches the prefix "aab"
```

```java
// z[i] = the length of the longest common prefix of s and s[i..] (z[0] = n by
// convention). O(n), using the match box [l, r) that reaches furthest right.
static int[] zFunction(String s) {
    int n = s.length();
    int[] z = new int[n];
    if (n > 0) z[0] = n;
    for (int i = 1, l = 0, r = 0; i < n; i++) {
        if (i < r) z[i] = Math.min(r - i, z[i - l]);            // reuse what the box already proved
        // then extend by comparing
        while (i + z[i] < n && s.charAt(z[i]) == s.charAt(i + z[i])) z[i]++;
        if (i + z[i] > r) {
            l = i;
            r = i + z[i];
        }
    }
    return z;
}

// Matching with Z: in pattern + separator + text, a z-value of at least m marks a match.
static List<Integer> zSearch(String text, String pattern) {
    String combined = pattern + '\0' + text;         // a separator that appears in neither string
    int[] z = zFunction(combined);
    int m = pattern.length();
    List<Integer> matches = new ArrayList<>();
    for (int i = m + 1; i < combined.length(); i++) {
        if (z[i] >= m) matches.add(i - m - 1);
    }
    return matches;
}

// LC 2223 Sum of Scores of Built Strings: each suffix's score is its z-value.
static long sumScores(String s) {
    long total = 0;
    for (int v : zFunction(s)) total += v;
    return total;
}
```

- **The box** `[l, r)` is the rightmost segment known to equal a prefix of s. Inside it, position i mirrors
  position `i − l`, so `z[i]` starts at `min(r − i, z[i − l])` and only has to extend past `r`. `r` only ever
  moves right, so the whole thing is O(n).
- **KMP or Z?** They answer the same questions, and each array can be converted into the other. Z is often
  easier to rederive in an interview; the prefix function is what you need for streaming text and for
  automata.

## 1.6 Rabin–Karp: rolling hashes

**Core idea:** read a window of m characters as a number in base `B`, modulo a large prime. Sliding the window
one step is O(1): remove the leading character's term, multiply by `B`, and add the new character.

```text
hash("abc") = a*B^2 + b*B + c
slide to "bcd":  (hash - a*B^2) * B + d  =  b*B^2 + c*B + d
```

```java
static final long MOD = 1_000_000_007L, BASE = 131;

// Rabin-Karp: slide a window hash along the text; compare characters only when the hashes agree.
static List<Integer> rabinKarp(String text, String pattern) {
    int n = text.length(), m = pattern.length();
    List<Integer> matches = new ArrayList<>();
    if (m == 0 || m > n) return matches;
    long highPow = 1;                       // BASE^(m-1): the weight of the char leaving the window
    for (int i = 1; i < m; i++) highPow = highPow * BASE % MOD;
    long target = 0, window = 0;
    for (int i = 0; i < m; i++) {
        target = (target * BASE + pattern.charAt(i)) % MOD;
        window = (window * BASE + text.charAt(i)) % MOD;
    }
    for (int i = 0; ; i++) {
        // equal hashes don't prove equal strings: check the characters
        if (window == target && text.regionMatches(i, pattern, 0, m)) matches.add(i);
        if (i + m == n) break;
        window = (window - text.charAt(i) * highPow % MOD + MOD) % MOD;    // remove text[i]
        window = (window * BASE + text.charAt(i + m)) % MOD;              // append text[i + m]
    }
    return matches;
}
```

- **Always verify on a hash match** (`regionMatches`). Then the algorithm is never wrong, only occasionally
  slower: a Las Vegas algorithm. Skipping the check makes it Monte Carlo, which is acceptable only with a
  strong hash (1.7).
- O(n + m) expected. An adversary who knows a fixed base can force collisions, so contest code picks a random
  base (*Math & Number Theory* guide).
- **Where Rabin–Karp beats KMP:** many patterns of the *same length* (put their hashes in a set),
  2D pattern matching (hash the rows, then the columns), and binary search over lengths (1.8).

When the alphabet is tiny and the window short, the window can be its own hash, with no collisions at all:

```java
// LC 187 Repeated DNA Sequences: a rolling "hash" with NO collisions.
// 2 bits per letter, so a window of 10 letters is a 20-bit int.
public List<String> findRepeatedDnaSequences(String s) {
    int[] code = new int[128];                   // 'A' = 0
    code['C'] = 1;
    code['G'] = 2;
    code['T'] = 3;
    Set<Integer> seen = new HashSet<>(), reported = new HashSet<>();
    List<String> result = new ArrayList<>();
    int window = 0, mask = (1 << 20) - 1;
    for (int i = 0; i < s.length(); i++) {
        window = ((window << 2) | code[s.charAt(i)]) & mask;   // shift in 2 bits, drop the oldest 2
        if (i >= 9 && !seen.add(window) && reported.add(window)) {  // seen before, not yet reported
            result.add(s.substring(i - 9, i + 1));
        }
    }
    return result;
}
```

With 2 bits per letter, a `long` holds a window of up to 32 letters exactly.

## 1.7 Substring hashing

Store the hash of every prefix, and the hash of any substring follows in O(1):

```text
h[i] = hash of s[0, i)
hash(s[l, r)) = h[r] - h[l] * B^(r - l)      (mod M)
```

```java
// Prefix hashes: after O(n) setup, the hash of ANY substring costs O(1).
// Two independent moduli make an accidental collision roughly a 1-in-10^18 event.
class StringHash {
    private static final long M1 = 1_000_000_007L, M2 = 998_244_353L, B = 131;
    private final long[] h1, h2, p1, p2;

    StringHash(String s) {
        int n = s.length();
        h1 = new long[n + 1];
        h2 = new long[n + 1];
        p1 = new long[n + 1];
        p2 = new long[n + 1];
        p1[0] = 1;
        p2[0] = 1;
        for (int i = 0; i < n; i++) {
            h1[i + 1] = (h1[i] * B + s.charAt(i)) % M1;     // h[i] = hash of s[0, i)
            h2[i + 1] = (h2[i] * B + s.charAt(i)) % M2;
            p1[i + 1] = p1[i] * B % M1;
            p2[i + 1] = p2[i] * B % M2;
        }
    }

    // The hash of s[l, r): h[r] - h[l] * B^(r - l), for both moduli, packed into one long.
    long get(int l, int r) {
        long a = Math.floorMod(h1[r] - h1[l] * p1[r - l], M1);
        long b = Math.floorMod(h2[r] - h2[l] * p2[r - l], M2);
        return a << 32 | b;
    }
}
```

- O(n) setup, then O(1) to compare any two substrings. With a second table built on reverse(s) you can also
  test any substring for being a palindrome in O(1). Binary search over lengths finds the longest common
  prefix of two suffixes in O(log n).
- **One modulus is not enough at scale.** With 10⁵ windows there are about 5 × 10⁹ pairs, so with M ≈ 10⁹ you
  should *expect* a few collisions (the birthday bound). Two independent moduli, or a single modulus near
  2⁶¹, make that negligible.
- Subtraction can go negative: wrap it with `Math.floorMod`.

## 1.8 Binary search + hashing: longest duplicate substring ⭐

```java
// LC 1044 Longest Duplicate Substring. If some length L repeats, so does L - 1 (drop a character),
// so binary search for the first length that does NOT repeat. Each check hashes every window: O(n).
public String longestDupSubstring(String s) {
    StringHash hash = new StringHash(s);
    int lo = 1, hi = s.length();                // length n never repeats, so the search always ends
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;
        if (findRepeat(s, hash, mid) < 0) hi = mid;
        else lo = mid + 1;
    }
    int len = lo - 1;                            // the longest length that does repeat
    if (len == 0) return "";
    int start = findRepeat(s, hash, len);
    return s.substring(start, start + len);
}

// The start of a window of this length that appeared
// earlier, or -1. Equal hashes are double-checked.
private int findRepeat(String s, StringHash hash, int len) {
    Map<Long, Integer> firstStart = new HashMap<>();
    for (int i = 0; i + len <= s.length(); i++) {
        Integer j = firstStart.putIfAbsent(hash.get(i, i + len), i);
        if (j != null && s.regionMatches(i, s, j, len)) return i;
    }
    return -1;
}
```

- **Why binary search works:** if a substring of length L appears twice, dropping its last character gives a
  substring of length L − 1 that also appears twice. So "has a repeat of length L" is monotone, and the
  first length *without* a repeat is found with the standard template (*Sorting & Binary Search* guide).
- O(n log n) expected. The same "binary search on the length + O(n) hash check" pattern solves Longest
  Repeating Substring (1062), Longest Common Subpath (1923) and the longest common substring of two strings.
- A suffix array gives the same answer deterministically: it's the maximum LCP value (3.1).

---

# Part 2 — Palindromes

## 2.1 Two pointers: checking a palindrome

```java
// LC 680 Valid Palindrome II: at most one deletion.
// At the first mismatch, try skipping either side.
public boolean validPalindrome(String s) {
    for (int lo = 0, hi = s.length() - 1; lo < hi; lo++, hi--) {
        if (s.charAt(lo) != s.charAt(hi)) {
            return isPalindrome(s, lo + 1, hi) || isPalindrome(s, lo, hi - 1);
        }
    }
    return true;
}

private boolean isPalindrome(String s, int lo, int hi) {
    while (lo < hi) {
        if (s.charAt(lo++) != s.charAt(hi--)) return false;
    }
    return true;
}
```

- **Valid Palindrome (125):** skip characters that fail `Character.isLetterOrDigit`, and compare with
  `Character.toLowerCase`.
- **One deletion allowed:** at the first mismatch, the deleted character must be one of the two being
  compared, so try both. O(n). With k deletions it becomes DP: Valid Palindrome III (1216) checks whether
  n minus the longest palindromic subsequence is at most k.

## 2.2 Expand around the center ⭐

```java
// LC 5 Longest Palindromic Substring: every palindrome has a center,
// either a character (odd length) or the gap between two (even
// length). Expand from all 2n - 1 centers: O(n^2) time, O(1) space.
public String longestPalindrome(String s) {
    int bestStart = 0, bestLen = 0;
    for (int center = 0; center < 2 * s.length() - 1; center++) {
        int lo = center / 2, hi = lo + center % 2;   // even center: one char; odd center: a gap
        while (lo >= 0 && hi < s.length() && s.charAt(lo) == s.charAt(hi)) {
            lo--;
            hi++;
        }
        if (hi - lo - 1 > bestLen) {             // the palindrome is s[lo + 1 .. hi - 1]
            bestStart = lo + 1;
            bestLen = hi - lo - 1;
        }
    }
    return s.substring(bestStart, bestStart + bestLen);
}

// LC 647 Palindromic Substrings: the same expansion; every successful step is one more palindrome.
public int countSubstrings(String s) {
    int count = 0;
    for (int center = 0; center < 2 * s.length() - 1; center++) {
        int lo = center / 2, hi = lo + center % 2;
        while (lo >= 0 && hi < s.length() && s.charAt(lo) == s.charAt(hi)) {
            count++;
            lo--;
            hi++;
        }
    }
    return count;
}
```

| `center` | `lo, hi` start at | Meaning |
|---|---|---|
| 0 | 0, 0 | character 0 (odd-length palindromes) |
| 1 | 0, 1 | the gap between characters 0 and 1 (even-length palindromes) |
| 2 | 1, 1 | character 1 |
| … | … | … |
| 2n − 2 | n − 1, n − 1 | the last character |

- O(n²) in the worst case (`"aaaa…"`), O(1) space. This is the expected interview answer for LC 5 and LC 647;
  Manacher is the follow-up.
- Forgetting the even-length centers is the classic bug: "abba" has no middle character.

## 2.3 Manacher's algorithm

```java
// Manacher: the longest palindrome at EVERY center in O(n). Interleave
// separators, "abba" -> "#a#b#b#a#", so that every palindrome has odd
// length. radius[i] is then the length of that palindrome in s.
static int[] manacher(String s) {
    int n = 2 * s.length() + 1;
    char[] t = new char[n];
    for (int i = 0; i < n; i++) t[i] = (i % 2 == 0) ? '#' : s.charAt(i / 2);
    int[] radius = new int[n];
    // [.., right] is the furthest-reaching one
    for (int i = 0, center = 0, right = 0; i < n; i++) {
        // its mirror's radius
        if (i < right) radius[i] = Math.min(right - i, radius[2 * center - i]);
        while (i - radius[i] - 1 >= 0 && i + radius[i] + 1 < n
                && t[i - radius[i] - 1] == t[i + radius[i] + 1]) {
            radius[i]++;
        }
        if (i + radius[i] > right) {
            center = i;
            right = i + radius[i];
        }
    }
    return radius;
}

static String longestPalindromeManacher(String s) {
    int[] radius = manacher(s);
    int best = 0;
    for (int i = 1; i < radius.length; i++) {
        if (radius[i] > radius[best]) best = i;
    }
    int start = (best - radius[best]) / 2;           // map the position in t back to s
    return s.substring(start, start + radius[best]);
}

// A center with radius r holds (r + 1) / 2 palindromes: lengths r, r - 2, ... down to 1 or 2.
static long countPalindromes(String s) {
    long count = 0;
    for (int r : manacher(s)) count += (r + 1) / 2;
    return count;
}
```

```text
s         a   b   a   a   b   a
t        # a # b # a # a # b # a #
radius   0 1 0 3 0 1 6 1 0 3 0 1 0       radius 6 at the middle '#': "abaaba"
```

- **The separators** make every palindrome in `t` odd-length, centered on a single position, and its radius
  in `t` equals its length in s. The separator may even occur in s: positions compared with each other always
  have the same parity, so a separator is only ever compared with a separator.
- **Why it's linear:** inside the palindrome that reaches furthest right, position i mirrors position
  `2·center − i`, so it starts with that radius (capped at the boundary) and only extends past `right`.
  `right` only moves right, so all the extending together costs O(n). It's the same idea as the Z-function's box.
- In interviews: know expand-around-center cold, and be able to explain Manacher's mirror. Few interviewers
  expect it written from memory.

## 2.4 Palindrome partitioning

```java
// LC 132 Palindrome Partitioning II: the fewest cuts so every piece
// is a palindrome, in O(n^2). Expand around every center; each
// palindrome s[lo..hi] found offers pieces[hi + 1] = pieces[lo] + 1.
public int minCut(String s) {
    int n = s.length();
    // pieces[i] = the fewest palindromes that make up s[0, i)
    int[] pieces = new int[n + 1];
    for (int i = 0; i <= n; i++) pieces[i] = i;  // the worst case: single characters
    // lo + hi == center, so pieces[lo] is final
    for (int center = 0; center < 2 * n - 1; center++) {
        int lo = center / 2, hi = lo + center % 2;
        while (lo >= 0 && hi < n && s.charAt(lo) == s.charAt(hi)) {
            pieces[hi + 1] = Math.min(pieces[hi + 1], pieces[lo] + 1);
            lo--;
            hi++;
        }
    }
    return pieces[n] - 1;
}
```

- **The order matters:** every palindrome ending at `lo − 1` has its center before the current one, so
  `pieces[lo]` is final by the time it's used. That's what the comment `lo + hi == center` refers to.
- **Palindrome Partitioning (131)** lists every partition: backtracking (*Recursion & Backtracking* guide),
  testing each piece with a precomputed `isPal[i][j]` table.
- The table version: `isPal[i][j] = s[i] == s[j] && (j − i < 2 || isPal[i + 1][j − 1])`, filled with `i`
  descending. It costs O(n²) memory, against O(n) for the center expansion above.
- The longest palindromic **subsequence** (516) is a different problem: an interval DP, or the LCS of s and
  reverse(s) (*Dynamic Programming* guide).

---

# Part 3 — Suffix Structures

## 3.1 Suffix arrays and LCP

**Core idea:** sort all n suffixes. Every substring is a prefix of some suffix, so sorting the suffixes puts
equal substrings next to each other, and their shared lengths become a single array, the **LCP**.

```text
s = banana
i    sa[i]   suffix     lcp[i]
0    5       a          0
1    3       ana        1        shares "a" with the previous suffix
2    1       anana      3        shares "ana": the longest repeat
3    0       banana     0
4    4       na         0
5    2       nana       2
distinct substrings = 6 * 7 / 2 - (1 + 3 + 0 + 0 + 2) = 21 - 6 = 15
```

```java
// Suffix array by prefix doubling: sort the suffixes by their first 1, 2, 4, 8, ... characters,
// reusing the previous round's ranks as sort keys. O(n log^2 n) with a comparison sort.
static int[] suffixArray(String s) {
    int n = s.length();
    if (n == 0) return new int[0];
    Integer[] sa = new Integer[n];
    int[] rank = new int[n], next = new int[n];
    for (int i = 0; i < n; i++) {
        sa[i] = i;
        rank[i] = s.charAt(i);
    }
    for (int k = 1; ; k <<= 1) {
        final int half = k;
        Comparator<Integer> byPair = (a, b) -> {  // (rank of the first k chars, rank of the next k)
            if (rank[a] != rank[b]) return Integer.compare(rank[a], rank[b]);
            int ra = a + half < n ? rank[a + half] : -1, rb = b + half < n ? rank[b + half] : -1;
            return Integer.compare(ra, rb);       // a suffix that runs out sorts first
        };
        Arrays.sort(sa, byPair);
        next[sa[0]] = 0;
        for (int i = 1; i < n; i++) {
            next[sa[i]] = next[sa[i - 1]] + (byPair.compare(sa[i - 1], sa[i]) < 0 ? 1 : 0);
        }
        System.arraycopy(next, 0, rank, 0, n);
        if (rank[sa[n - 1]] == n - 1) break;         // every rank distinct: the order is final
    }
    int[] result = new int[n];
    for (int i = 0; i < n; i++) result[i] = sa[i];
    return result;
}

// Kasai: lcp[i] = the longest common prefix of the
// suffixes at sa[i - 1] and sa[i] (lcp[0] = 0). O(n).
static int[] lcpArray(String s, int[] sa) {
    int n = s.length();
    int[] rank = new int[n], lcp = new int[n];
    for (int i = 0; i < n; i++) rank[sa[i]] = i;
    for (int i = 0, h = 0; i < n; i++) {    // suffixes in TEXT order: h drops by at most 1 per step
        if (rank[i] == 0) {
            h = 0;
            continue;
        }
        int j = sa[rank[i] - 1];                    // the suffix just before s[i..] in sorted order
        while (i + h < n && j + h < n && s.charAt(i + h) == s.charAt(j + h)) h++;
        lcp[rank[i]] = h;
        if (h > 0) h--;
    }
    return lcp;
}

// Every substring is a prefix of some suffix. In sorted order, each suffix brings its length
// in prefixes, minus the lcp it shares with the previous suffix (those were already counted).
static long distinctSubstrings(String s) {
    int[] sa = suffixArray(s), lcp = lcpArray(s, sa);
    long n = s.length(), total = n * (n + 1) / 2;
    for (int v : lcp) total -= v;
    return total;
}
```

- **Prefix doubling:** after the round with step k, the suffixes are sorted by their first 2k characters. A
  suffix's key for the next round is the pair (rank of its first k characters, rank of the k after them), and
  both are already known. That's log n rounds of sorting, O(n log² n). Radix-sorting the pairs gives
  O(n log n), and SA-IS gives O(n), which is contest material.
- **Kasai's trick:** visiting the suffixes in text order, the LCP with the sorted predecessor drops by at most
  1 from one suffix to the next, so `h` never restarts from 0. O(n).
- **What it answers:** the number of distinct substrings (`n(n + 1)/2 − Σ lcp`), the longest repeated
  substring (the maximum LCP), the longest common substring of A and B (build it on `A + "#" + B` and take the
  largest LCP between suffixes from different sides), and pattern search by binary search over `sa` in
  O(m log n).

## 3.2 Choosing a structure

| You need | Use | Where |
|---|---|---|
| prefixes of many words, autocomplete | trie | *Tries* guide |
| many patterns found in one text | Aho–Corasick | *Tries* guide |
| all substrings of one string, offline | suffix array + LCP | 3.1 |
| substring occurrence counts, online | suffix automaton or suffix tree | name it; rarely coded in interviews |
| comparisons between arbitrary substrings | prefix hashes | 1.7 |

---

# Part 4 — Solving Any String Question

## 4.1 The decision procedure

| The problem says… | Reach for |
|---|---|
| find a pattern in linear time | KMP or Z (1.3, 1.5) |
| "repeated pattern", period, smallest repeating unit | prefix function: `n − pi[n − 1]` (1.4) |
| the longest prefix that is also a suffix | prefix function (1.4) |
| add characters in front to make a palindrome | `s + "#" + reverse(s)` (1.4) |
| how far each position matches the start of the string | Z-function (1.5) |
| repeated fixed-length windows, many patterns of one length | rolling hash (1.6) |
| compare many substrings, longest repeat | prefix hashes + binary search (1.7, 1.8) |
| palindrome after at most one deletion | two pointers (2.1) |
| longest / count palindromic substrings | expand around the center; Manacher for O(n) (2.2, 2.3) |
| fewest cuts into palindromes | center expansion + DP (2.4) |
| distinct substrings, sorted suffixes | suffix array + LCP (3.1) |
| no repeated characters, anagrams, minimum window | sliding window (*Arrays & Strings* guide) |
| edit distance, LCS, palindromic subsequence | DP (*Dynamic Programming* guide) |
| many words, prefixes, many patterns at once | trie / Aho–Corasick (*Tries* guide) |

**Constraint hints:** n up to 10⁴ allows O(n²) (expand around the center, a DP table). n up to 10⁵–10⁶ needs
O(n) or O(n log n): KMP, Z, Manacher, hashing with binary search, or a suffix array.

## 4.2 Edge cases to test every time

| Input | What it breaks |
|---|---|
| the empty string | `pi[n − 1]`, the `2n − 1` centers when n = 0, `substring` bounds |
| a single character | borders and periods of length 1; `minCut` must be 0 |
| all characters equal (`"aaaa"`) | worst case for naive matching and center expansion; overlapping matches |
| pattern longer than the text | the Rabin–Karp window setup |
| pattern equal to the text | exactly one match, at 0 |
| a separator that appears in the input | `pattern + "#" + text` tricks give false matches |
| uppercase, digits, Unicode | `int[26]` indexing with `c − 'a'` |
| overlapping matches (`"aa"` in `"aaaa"`) | resetting `k = 0` after a match instead of `pi[k − 1]` |

## 4.3 Practice ladder

**Warm-up**
- Valid Palindrome (125)
- Find the Index of the First Occurrence in a String (28): naive, then KMP
- Longest Common Prefix (14)
- Valid Palindrome II (680) ⭐
- Rotate String (796): `goal` is a rotation of `s` iff it occurs in `s + s` with equal lengths

**Core**
- Longest Palindromic Substring (5) ⭐
- Palindromic Substrings (647) ⭐
- Repeated Substring Pattern (459)
- Shortest Palindrome (214) ⭐
- Longest Happy Prefix (1392)
- Repeated String Match (686)
- Repeated DNA Sequences (187)
- Palindrome Partitioning (131)

**Hard**
- Palindrome Partitioning II (132)
- Longest Duplicate Substring (1044) ⭐
- Sum of Scores of Built Strings (2223)
- Distinct Echo Substrings (1316)
- Longest Common Subpath (1923)
- Palindrome Pairs (336) and Stream of Characters (1032): see the *Tries* guide

## 4.4 The mistakes that cost people offers

1. **`+=` on a string inside a loop**, which is O(n²). Use `StringBuilder`.
2. **Comparing strings with `==`.**
3. **Splitting on an unescaped regex symbol:** `split(".")` returns an empty array.
4. **Restarting KMP at 0 after a match** instead of `pi[k − 1]`, which loses overlapping matches.
5. **Hashing without `floorMod`**, with a single small modulus over many windows, or without verifying when a
   wrong answer is unacceptable.
6. **Forgetting even-length palindromes** in center expansion.
7. **Off-by-one errors mapping Manacher's positions back** to the original string.
8. **Calling `substring` in a hot loop** when comparing indexes would do.
9. **Concatenating with a separator that can appear in the input.**
10. **Claiming `indexOf` is linear**, or treating palindromic *substrings* and *subsequences* as one problem.

## 4.5 The one-page summary

```text
JAVA          immutable; += in a loop is O(n^2) -> StringBuilder; equals not ==; substring copies
              split takes a regex; indexOf is naive O(n*m)

BORDERS       pi[i] = longest proper prefix of s[0..i] that is also its suffix
              k = pi[i-1]; while (k > 0 && s[i] != s[k]) k = pi[k-1]; if (s[i] == s[k]) k++
KMP           same loop over the text; on a full match record it and set k = pi[k-1]
PERIOD        p = n - pi[n-1]; whole repetition iff p < n && n % p == 0
SHORTEST PAL  pi of s + "#" + reverse(s) -> longest palindromic prefix; prepend the rest reversed
Z             z[i] = lcp(s, s[i..]); box [l, r): z[i] = min(r - i, z[i - l]), then extend
              search: pattern + sep + text, z >= m

ROLLING HASH  window = (window - out * B^(m-1)) * B + in   (mod M); verify on a match
SUBSTRINGS    h[r] - h[l] * B^(r-l); two moduli; floorMod; binary search on the length

PALINDROMES   two pointers; one deletion: try skipping either side
EXPAND        2n - 1 centers: lo = c / 2, hi = lo + c % 2; O(n^2), O(1) space
MANACHER      "#a#b#a#", radius = length in s; mirror 2*center - i inside the right edge; O(n)
MIN CUT       expand every center; pieces[hi + 1] = min(pieces[hi + 1], pieces[lo] + 1)

SUFFIX ARRAY  prefix doubling with rank pairs, O(n log^2 n); Kasai LCP, O(n)
              distinct substrings = n(n+1)/2 - sum(lcp); longest repeat = max(lcp)
```

Print that block. Read it before every mock interview.

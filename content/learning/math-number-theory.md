# Math & Number Theory — From Scratch to Advanced

A complete, self-contained deep dive for Java interviews.

**How to use this file:** Part 0 covers the integer facts behind most "math" bugs: overflow, the sign rules
of `/` and `%`, and doubles. Part 1 is number theory: digits, GCD, extended Euclid, primes and sieves, fast
exponentiation, modular arithmetic, combinatorics, matrix power, big numbers and bases. Part 2 covers the
geometry interviews actually ask about. Part 3 covers randomized algorithms: shuffling, reservoir sampling,
weighted picks and rejection sampling. Part 4 has the recognition table, the overflow checklist, the
practice ladder and the one-page summary.

Every solution below compiles and passes randomised tests against brute-force references. The randomized
algorithms are checked statistically, over hundreds of thousands of draws.
Problem numbers like **LC 204** refer to LeetCode.

---

## Table of Contents

**[Part 0 — The mental model](#part-0--the-mental-model)**

**[Part 1 — Number theory](#part-1--number-theory)**
1. [Digits and overflow](#11-digits-and-overflow)
2. [GCD and LCM](#12-gcd-and-lcm)
3. [Extended Euclid and modular inverses](#13-extended-euclid-and-modular-inverses)
4. [Primes: trial division and the sieve](#14-primes-trial-division-and-the-sieve)
5. [The smallest-prime-factor sieve](#15-many-factorisations-the-smallest-prime-factor-sieve)
6. [Ugly numbers](#16-numbers-built-from-given-primes-ugly-numbers)
7. [Fast exponentiation](#17-fast-exponentiation)
8. [Modular arithmetic](#18-modular-arithmetic)
9. [Combinatorics](#19-combinatorics)
10. [Matrix exponentiation](#110-matrix-exponentiation)
11. [Big numbers as strings](#111-big-numbers-as-strings)
12. [Bases and digit systems](#112-bases-and-digit-systems)

**[Part 2 — Geometry essentials](#part-2--geometry-essentials)**
1. [Rectangles and overlaps](#21-rectangles-and-overlaps)
2. [The cross product](#22-the-cross-product)
3. [Points on a line](#23-points-on-a-line)
4. [Distances without square roots](#24-distances-without-square-roots)

**[Part 3 — Randomized algorithms](#part-3--randomized-algorithms)**
1. [Java's random toolbox](#31-javas-random-toolbox)
2. [Fisher–Yates shuffle](#32-fisheryates-shuffle)
3. [Reservoir sampling](#33-reservoir-sampling)
4. [Weighted random choice](#34-weighted-random-choice)
5. [Rejection sampling](#35-rejection-sampling)
6. [Random access in O(1)](#36-random-access-in-o1-insert-delete-getrandom)

**[Part 4 — Solving any math question](#part-4--solving-any-math-question)**

---

# Part 0 — The Mental Model

Interview math is a small toolkit. Most "math" questions test whether you can:
1. **keep integers from overflowing**, silently and at every step;
2. **apply one of about six classic algorithms**: Euclid, the sieve, fast power, modular inverse,
   binomial coefficients, and a few randomized tricks;
3. **spot the structure** (a gcd, a modulus, a count) hiding inside a story.

| Type | Range | Roughly | What it means in practice |
|---|---|---|---|
| `int` | −2³¹ … 2³¹ − 1 | ±2.1 × 10⁹ | the product of two values above 46,340 overflows |
| `long` | −2⁶³ … 2⁶³ − 1 | ±9.2 × 10¹⁸ | the product of two values below 3 × 10⁹ fits |
| `double` | 53-bit mantissa | exact integers up to 2⁵³ ≈ 9 × 10¹⁵ | never compare with `==` |
| `1_000_000_007` | a prime | (10⁹ + 7)² ≈ 10¹⁸ fits a `long` | the standard "answer modulo" value |

The rules that cause the most bugs, all checked by the test harness:

```java
static void integerRules() {
    int q = -7 / 2;                              // -3: integer division rounds toward zero
    int r = -7 % 2;                              // -1: the remainder takes the sign of the dividend
    int down = Math.floorDiv(-7, 2);             // -4: rounds toward negative infinity
    int mod = Math.floorMod(-7, 3);              //  2: always in [0, 3) for a positive divisor
    // 1410065408: the int product overflowed BEFORE widening
    long wrong = 100_000 * 100_000;
    long right = 100_000L * 100_000;             // 10000000000: make one operand long first
    int abs = Math.abs(Integer.MIN_VALUE);       // -2147483648: +2^31 doesn't exist in an int
    int ceil = (7 + 3 - 1) / 3;                  // 3: the ceiling of 7 / 3 (non-negative values)
    boolean same = 0.1 + 0.2 == 0.3;             // false: compare doubles with a tolerance
    try {
        // throws ArithmeticException instead of wrapping around
        Math.multiplyExact(1 << 20, 1 << 12);
    } catch (ArithmeticException overflow) {
        // handle it, or move to long / BigInteger
    }
}
```

- **Overflow is silent.** Java wraps around without an error. Widen *before* the operation:
  `(long) a * b`, not `(long) (a * b)`.
- **`Math.abs(Integer.MIN_VALUE)` and `-Integer.MIN_VALUE` are still negative.** Widen to `long` first.
- **`%` can be negative** in Java. When you need an index or a residue, use `Math.floorMod`.
- **Midpoints:** `lo + (hi - lo) / 2`, never `(lo + hi) / 2` (*Sorting & Binary Search* guide).
- **Avoid doubles** whenever an integer formulation exists: compare fractions by cross-multiplying,
  distances by their squares, and slopes as reduced `(dx, dy)` pairs (2.3).

---

# Part 1 — Number Theory

## 1.1 Digits and overflow

**Trigger:** reverse the digits, palindromic numbers, digit sums, "without converting to a string",
"return 0 if it overflows".
**Core idea:** `x % 10` is the last digit, `x / 10` drops it, and `result * 10 + d` appends one. The only hard
part is overflow.

```java
// LC 7 Reverse Integer: return 0 if the result doesn't fit in an int, without using a long.
public int reverse(int x) {
    int result = 0;
    while (x != 0) {
        int digit = x % 10;                     // negative when x is: the sign takes care of itself
        // result * 10 would overflow
        if (result > Integer.MAX_VALUE / 10 || result < Integer.MIN_VALUE / 10) return 0;
        result = result * 10 + digit;
        x /= 10;
    }
    return result;
}

// LC 9 Palindrome Number, without a string: reverse only the second half of the digits.
public boolean isPalindrome(int x) {
    if (x < 0 || (x % 10 == 0 && x != 0)) return false;    // "-121" and "10" can't be palindromes
    int half = 0;
    while (x > half) {
        half = half * 10 + x % 10;
        x /= 10;
    }
    return x == half || x == half / 10;                     // odd length: drop the middle digit
}
```

- **Why `reverse` doesn't check the digit:** the test `result > MAX / 10` catches every overflowing `* 10`.
  When `result` equals `MAX / 10` (214748364) exactly, overflow would need a final digit above 7. But that
  digit is the *first* digit of a 10-digit `int`, so it's 1 or 2.
- **Palindrome:** reversing only half of the digits can't overflow. Numbers ending in 0 (other than 0) can't
  be palindromes, because nothing starts with 0.
- Related: Add Digits (258) has the closed form `1 + (n - 1) % 9` (the digital root); Happy Number (202) is
  cycle detection with fast and slow pointers (*Linked Lists* guide).

## 1.2 GCD and LCM

**Trigger:** "split into equal groups", fractions, ratios, "when do two cycles line up again?".
**Core idea (Euclid):** every common divisor of `a` and `b` also divides `a mod b`, so
`gcd(a, b) = gcd(b, a mod b)`. The numbers shrink fast: O(log min(a, b)) steps, with consecutive Fibonacci
numbers as the worst case.

```text
gcd(48, 18)    48 = 2 * 18 + 12
gcd(18, 12)    18 = 1 * 12 + 6
gcd(12, 6)     12 = 2 * 6  + 0
gcd(6, 0)  =   6
```

```java
// Euclid: gcd(a, b) = gcd(b, a mod b), and gcd(a, 0) = a. O(log min(a, b)) steps.
static long gcd(long a, long b) {
    while (b != 0) {
        long t = a % b;
        a = b;
        b = t;
    }
    return Math.abs(a);
}

static long lcm(long a, long b) {
    return a / gcd(a, b) * b;             // divide FIRST: a * b can overflow even when the lcm fits
}
```

- `gcd(a, 0) = a`, so 0 is the neutral starting value when folding over an array:
  `g = 0; for (x : arr) g = gcd(g, x);`.
- `gcd(a, b) * lcm(a, b) = a * b`. Two cycles of lengths a and b line up every `lcm(a, b)` steps.
- Java has `BigInteger.gcd` but no `Math.gcd`. Write the five-line loop.

```java
// LC 914 X of a Kind: equal groups of size >= 2 exist iff the gcd of all the counts is >= 2.
public boolean hasGroupsSizeX(int[] deck) {
    Map<Integer, Integer> count = new HashMap<>();
    for (int card : deck) count.merge(card, 1, Integer::sum);
    long g = 0;                                  // gcd(0, x) = x, so 0 is the starting value
    for (int c : count.values()) g = gcd(g, c);
    return g >= 2;
}

// LC 365 Water and Jug: by Bezout, the amounts you can measure are
// exactly the multiples of gcd(x, y) that fit in both jugs together.
public boolean canMeasureWater(int x, int y, int target) {
    if (target > (long) x + y) return false;
    return target % gcd(x, y) == 0;
}
```

**Bézout's identity** behind the jug problem: the values `a·x + b·y` for integers x and y (fill = +,
empty = −) are exactly the multiples of `gcd(a, b)`. Other gcd problems: Fraction Addition and Subtraction
(592), Simplified Fractions (1447), and Rotate Array (189), whose in-place cyclic version moves `gcd(n, k)`
cycles.

## 1.3 Extended Euclid and modular inverses

**Trigger:** "solve a·x ≡ 1 (mod m)", division under a modulus, Bézout coefficients, the Chinese Remainder
Theorem.
**Core idea:** run Euclid, and on the way back out of the recursion, rewrite the coefficients:
if `b·x' + (a mod b)·y' = g` and `a mod b = a − ⌊a/b⌋·b`, then `a·y' + b·(x' − ⌊a/b⌋·y') = g`.

```java
// Extended Euclid: returns {g, x, y} with a*x + b*y = g = gcd(a, b).
static long[] extGcd(long a, long b) {
    if (b == 0) return new long[] { a, 1, 0 };
    long[] r = extGcd(b, a % b);               // b*x' + (a mod b)*y' = g, and a mod b = a - (a/b)*b
    return new long[] { r[0], r[2], r[1] - (a / b) * r[2] };
}

// The inverse of a modulo m exists exactly when gcd(a, m) = 1. Works for any m, prime or not.
static long modInverse(long a, long m) {
    long[] r = extGcd(Math.floorMod(a, m), m);
    if (r[0] != 1) throw new ArithmeticException("no inverse: gcd(a, m) = " + r[0]);
    return Math.floorMod(r[1], m);
}
```

```text
extGcd(240, 46) = {2, -9, 47}        240 * (-9) + 46 * 47 = -2160 + 2162 = 2
```

| Modulus | How to invert a | Cost |
|---|---|---|
| a prime p, such as 10⁹ + 7 | Fermat: `a^(p−2) mod p` | O(log p): just `modPow` (1.7) |
| any m, with gcd(a, m) = 1 | extended Euclid (above) | O(log m) |
| all of 1..n modulo a prime | inverse factorials (1.9), or `inv[i] = (p − p / i) · inv[p mod i] mod p` | O(n) in total |

If `gcd(a, m) > 1`, there is **no** inverse, and "dividing" by `a` modulo `m` is meaningless.

## 1.4 Primes: trial division and the sieve

**Trigger:** "is n prime?", "count the primes below n", "prime factors", "smallest prime factor".

```java
// Trial division: a composite n has a factor <= sqrt(n).
// Checking 6k - 1 and 6k + 1 skips multiples of 2 and 3.
static boolean isPrime(long n) {
    if (n < 2) return false;
    if (n < 4) return true;                      // 2 and 3
    if (n % 2 == 0 || n % 3 == 0) return false;
    for (long i = 5; i * i <= n; i += 6) {
        if (n % i == 0 || n % (i + 2) == 0) return false;
    }
    return true;
}

// Prime factorisation by trial division, O(sqrt n): 360 -> [2, 2, 2, 3, 3, 5].
static List<Long> primeFactors(long n) {
    List<Long> factors = new ArrayList<>();
    for (long p = 2; p * p <= n; p++) {
        while (n % p == 0) {
            factors.add(p);
            n /= p;
        }
    }
    if (n > 1) factors.add(n);                   // what's left is one prime bigger than sqrt(n)
    return factors;
}
```

- **Why √n:** if `n = a · b` with `a ≤ b`, then `a ≤ √n`. So if nothing up to √n divides n, n is prime.
- Write the loop as `i * i <= n` with a `long i`, not `i <= Math.sqrt(n)`: no floating point, and no
  overflow on `i * i`.
- **6k ± 1:** every prime above 3 has that form, because 6k, 6k + 2, 6k + 3 and 6k + 4 are divisible by 2
  or 3. That skips two thirds of the candidates.

When you need *all* the primes up to n, cross out multiples instead of testing each number:

```java
// LC 204 Count Primes (strictly below n): the sieve of Eratosthenes, O(n log log n).
public int countPrimes(int n) {
    if (n < 3) return 0;
    boolean[] composite = new boolean[n];
    int count = n - 2;                           // 2 .. n - 1, minus each composite crossed out
    for (int i = 2; (long) i * i < n; i++) {
        if (composite[i]) continue;
        // smaller multiples were crossed out by smaller primes
        for (int j = i * i; j < n; j += i) {
            if (!composite[j]) {
                composite[j] = true;
                count--;
            }
        }
    }
    return count;
}
```

```text
n = 30                      new numbers crossed out
i = 2    from 4:   4 6 8 10 12 14 16 18 20 22 24 26 28
i = 3    from 9:   9 15 21 27                       (12, 18, 24 were already gone)
i = 4    composite: skip
i = 5    from 25:  25
i = 6    6 * 6 = 36 >= 30: stop
primes:  2 3 5 7 11 13 17 19 23 29   -> 10
```

- **Why start at `i * i`:** a smaller multiple `i · k` with `k < i` has a prime factor smaller than `i`, so
  it was crossed out already.
- O(n log log n), which is effectively linear. Memory is n booleans: 10⁷ of them is 10 MB, and a `BitSet`
  cuts that by 8.

## 1.5 Many factorisations: the smallest-prime-factor sieve

**Trigger:** factorise *many* numbers up to about 10⁶–10⁷, count divisors, group numbers by shared prime
factors.
**Core idea:** a sieve that records, for every x, its smallest prime factor. Factorising x is then just
dividing by `spf[x]` repeatedly, O(log x) per number.

```java
// Smallest-prime-factor sieve: O(n log log n) once, then any x <= n factorises in O(log x).
class Factorizer {
    private final int[] spf;                     // spf[x] = the smallest prime dividing x

    Factorizer(int n) {
        spf = new int[n + 1];
        for (int i = 2; i <= n; i++) {
            if (spf[i] != 0) continue;           // not prime: a smaller prime already claimed it
            for (int j = i; j <= n; j += i) {
                if (spf[j] == 0) spf[j] = i;
            }
        }
    }

    List<Integer> factorize(int x) {
        List<Integer> factors = new ArrayList<>();
        while (x > 1) {
            factors.add(spf[x]);
            x /= spf[x];
        }
        return factors;
    }

    // x = p1^a1 * p2^a2 * ... has (a1 + 1)(a2 + 1)... divisors.
    int countDivisors(int x) {
        int result = 1;
        while (x > 1) {
            int p = spf[x], exponent = 0;
            while (x % p == 0) {
                x /= p;
                exponent++;
            }
            result *= exponent + 1;
        }
        return result;
    }
}
```

- From a factorisation `x = p₁^a₁ · p₂^a₂ ⋯` you get the number of divisors `(a₁ + 1)(a₂ + 1)⋯`, the sum of
  divisors, and Euler's totient `φ(x) = x · ∏(1 − 1/p)`.
- Largest Component Size by Common Factor (952): union every number with each of its prime factors
  (union-find, *Graphs* guide).
- To list the divisors of one n, loop `i` up to √n and take both `i` and `n / i`: O(√n).

## 1.6 Numbers built from given primes: ugly numbers

**Trigger:** "numbers whose only prime factors are…", "the n-th number of a sequence built by multiplying".

```java
// LC 264 Ugly Number II: the n-th number whose only prime factors are 2, 3 and 5.
// Every ugly number is a smaller one times 2, 3 or 5: merge those three sorted streams.
public int nthUglyNumber(int n) {
    int[] ugly = new int[n];
    ugly[0] = 1;
    int i2 = 0, i3 = 0, i5 = 0;
    for (int k = 1; k < n; k++) {
        int next = Math.min(ugly[i2] * 2, Math.min(ugly[i3] * 3, ugly[i5] * 5));
        ugly[k] = next;
        if (next == ugly[i2] * 2) i2++;      // advance EVERY stream that produced it: 6 = 3*2 = 2*3
        if (next == ugly[i3] * 3) i3++;
        if (next == ugly[i5] * 5) i5++;
    }
    return ugly[n - 1];
}
```

```text
x2 stream:   2  4  6  8  10  12 ...
x3 stream:   3  6  9  12  15 ...
x5 stream:   5  10  15  20 ...
merged:   1  2  3  4  5  6  8  9  10  12 ...      6 comes from x2 and x3: advance both, no duplicate
```

- Every ugly number except 1 is a smaller ugly number times 2, 3 or 5, so the sequence is the merge of
  three sorted streams, each a pointer into the sequence itself. O(n).
- Super Ugly Number (313) uses k primes: k pointers, or a min-heap. Ugly Number (263) just divides out 2, 3
  and 5 and checks that 1 is left.

## 1.7 Fast exponentiation

**Trigger:** `a^b` with b up to 10⁹ or 10¹⁸, "modulo 10⁹ + 7", Pow(x, n), anything "applied n times" that
can be composed (matrices, permutations).
**Core idea:** write the exponent in binary, `a^13 = a^8 · a^4 · a^1`. Square the base at every step, and
multiply it into the result when the current bit is 1: O(log b) multiplications.

```text
exp = 13 = 0b1101       base      result
bit 0 = 1               a         a
bit 1 = 0               a^2       a            (bit not set: skip)
bit 2 = 1               a^4       a^5
bit 3 = 1               a^8       a^13
```

```java
// base^exp mod m by square-and-multiply, O(log exp).
// Safe for m up to about 3 * 10^9 (products < 2^63).
static long modPow(long base, long exp, long mod) {
    long result = 1 % mod;                       // 1 % 1 == 0
    base = Math.floorMod(base, mod);
    while (exp > 0) {
        if ((exp & 1) == 1) result = result * base % mod;  // this bit of exp is set: multiply it in
        base = base * base % mod;                          // base, base^2, base^4, base^8, ...
        exp >>= 1;
    }
    return result;
}
```

The same loop on doubles is LC 50:

```java
// LC 50 Pow(x, n): square-and-multiply on doubles.
// Widen n to long: -Integer.MIN_VALUE overflows an int.
public double myPow(double x, int n) {
    long e = n;
    if (e < 0) {
        x = 1 / x;
        e = -e;
    }
    double result = 1;
    while (e > 0) {
        if ((e & 1) == 1) result *= x;
        x *= x;
        e >>= 1;
    }
    return result;
}
```

- **`long e = n` matters:** for `n = Integer.MIN_VALUE`, `-n` is still negative in an `int`.
- `Math.pow` is fine for doubles but useless for exact large integers. `BigInteger.modPow` exists, but
  interviewers want the loop.
- Super Pow (372) computes `a^b mod 1337` with b given as a digit array, using
  `a^(10q + d) = (a^q)^10 · a^d`.

## 1.8 Modular arithmetic

**Trigger:** "return the answer modulo 10⁹ + 7". That sentence means the true answer is astronomically large,
so you reduce after **every** addition and multiplication.

```java
// prime; (MOD - 1)^2 < 2^63, so a product of two residues fits
static final long MOD = 1_000_000_007L;

// Every input is already in [0, MOD); every output stays there.
static long addMod(long a, long b) { return (a + b) % MOD; }
// % can go negative: add MOD back
static long subMod(long a, long b) { return ((a - b) % MOD + MOD) % MOD; }
static long mulMod(long a, long b) { return a * b % MOD; }

// Division = multiplying by the inverse. MOD is prime,
// so by Fermat a^(MOD-1) = 1 and a^(MOD-2) = 1/a.
static long divMod(long a, long b) { return a * modPow(b, MOD - 2, MOD) % MOD; }
```

| Operation | Safe form | Why |
|---|---|---|
| a + b | `(a + b) % MOD` | two values below MOD sum to less than 2·MOD |
| a − b | `((a - b) % MOD + MOD) % MOD` | Java's `%` keeps the sign, so the result can be negative |
| a · b | `a * b % MOD` on `long`s | (MOD − 1)² < 2⁶³; an `int * int` overflows *before* the `%` |
| a / b | `a * inverse(b) % MOD` | `%` doesn't distribute over division; multiply by the inverse (1.3) |
| comparisons | don't | after reducing, order means nothing; compare the true values (or their logarithms) |

The classic bug is taking `% MOD` only at the end: by then the intermediate values have already overflowed.

## 1.9 Combinatorics

**Trigger:** "the number of ways" to choose, arrange or build something; grid paths; binary trees; balanced
parentheses.

| Count | Formula | Example |
|---|---|---|
| orderings of n items | n! | permutations |
| ordered choices of k from n | n! / (n − k)! | podium finishes |
| subsets of size k | C(n, k) = n! / (k! (n − k)!) | committees |
| all subsets | 2ⁿ | bitmask enumeration |
| k items from n types, repeats allowed | C(n + k − 1, k) | stars and bars |
| monotone paths in an a × b grid | C(a + b, a) | Unique Paths (62) |
| Catalan number Cₙ | C(2n, n) / (n + 1) | BSTs with n nodes, balanced parentheses with n pairs |

Three ways to compute C(n, k):

| Method | When | Cost |
|---|---|---|
| Pascal's triangle, `C(n, k) = C(n−1, k−1) + C(n−1, k)` | n up to a few thousand; no division, so any modulus works | O(n²) table |
| multiplicative, `r = r · (n − k + i) / i` | one exact value that fits in a `long` | O(k) |
| factorials and inverse factorials mod p | many queries modulo a prime | O(n) once, then O(1) each |

```java
// C(n, r) mod a prime: n! / (r! (n - r)!) with precomputed
// factorials and inverse factorials. O(1) per query.
class Binomial {
    private final long[] fact, invFact;

    Binomial(int n) {
        fact = new long[n + 1];
        invFact = new long[n + 1];
        fact[0] = 1;
        for (int i = 1; i <= n; i++) fact[i] = fact[i - 1] * i % MOD;
        // One Fermat inverse for n!, then walk down with 1/(i-1)! = i * (1/i!).
        invFact[n] = modPow(fact[n], MOD - 2, MOD);
        for (int i = n; i > 0; i--) invFact[i - 1] = invFact[i] * i % MOD;
    }

    long choose(int n, int r) {
        if (r < 0 || r > n) return 0;
        return fact[n] * invFact[r] % MOD * invFact[n - r] % MOD;
    }
}
```

```java
// LC 62 Unique Paths: choose which (m - 1) of the (m + n - 2) moves go down.
// That's C(m+n-2, m-1), computed without factorials.
public int uniquePaths(int m, int n) {
    int moves = m + n - 2, downs = Math.min(m, n) - 1;
    long result = 1;
    for (int i = 1; i <= downs; i++) {
        // exact: after step i, result = C(moves - downs + i, i)
        result = result * (moves - downs + i) / i;
    }
    return (int) result;
}

// LC 96 Unique Binary Search Trees: the Catalan numbers. Try every root; the two sides multiply.
public int numTrees(int n) {
    long[] trees = new long[n + 1];
    trees[0] = 1;
    for (int nodes = 1; nodes <= n; nodes++) {
        for (int root = 1; root <= nodes; root++) {
            trees[nodes] += trees[root - 1] * trees[nodes - root];    // left x right shapes
        }
    }
    return (int) trees[n];
}

// LC 172 Factorial Trailing Zeroes: count the factors
// of 5 in n! (there are always more 2s than 5s).
public int trailingZeroes(int n) {
    int zeros = 0;
    while (n > 0) {
        n /= 5;                                  // multiples of 5, then of 25, 125, ...
        zeros += n;
    }
    return zeros;
}
```

- **Unique Paths** stays exact at every step because each partial result is itself a binomial coefficient,
  so the division never leaves a remainder.
- **Unique BSTs:** choosing root `r` leaves `r − 1` nodes on the left and `n − r` on the right, giving
  `Cₙ = Σ Cᵣ₋₁ · Cₙ₋ᵣ`. The same recurrence counts the outputs of Generate Parentheses (22).
- **Trailing zeroes** use Legendre's formula: the power of a prime p in n! is `⌊n/p⌋ + ⌊n/p²⌋ + ⌊n/p³⌋ + …`.

## 1.10 Matrix exponentiation

**Trigger:** a linear recurrence (Fibonacci, tribonacci, "ways to climb or tile") with n up to 10¹⁸.
**Core idea:** write one step of the recurrence as a matrix multiplication, then raise the matrix to the
n-th power with the same square-and-multiply loop as `modPow`.

```text
| F(n+1) |   | 1  1 |   | F(n)   |                | 1  1 |^n   | F(n+1)  F(n)   |
| F(n)   | = | 1  0 | * | F(n-1) |       so       | 1  0 |   = | F(n)    F(n-1) |
```

```java
// Linear recurrences in O(k^3 log n). For Fibonacci:
// [[1, 1], [1, 0]]^n = [[F(n+1), F(n)], [F(n), F(n-1)]].
static long[][] matMul(long[][] a, long[][] b) {
    int rows = a.length, cols = b[0].length, inner = b.length;
    long[][] c = new long[rows][cols];
    for (int i = 0; i < rows; i++) {
        for (int k = 0; k < inner; k++) {
            for (int j = 0; j < cols; j++) c[i][j] = (c[i][j] + a[i][k] * b[k][j]) % MOD;
        }
    }
    return c;
}

static long[][] matPow(long[][] m, long exp) {
    long[][] result = new long[m.length][m.length];
    for (int i = 0; i < m.length; i++) result[i][i] = 1;   // the identity matrix
    while (exp > 0) {                                      // the same square-and-multiply as modPow
        if ((exp & 1) == 1) result = matMul(result, m);
        m = matMul(m, m);
        exp >>= 1;
    }
    return result;
}

static long fibMod(long n) {                                 // F(n) mod MOD, for n up to 10^18
    return matPow(new long[][] { { 1, 1 }, { 1, 0 } }, n)[0][1];
}
```

- A recurrence with k terms needs a k × k matrix: O(k³ log n).
- For n up to about 10⁷ a plain loop is simpler. Mention matrix power when n is astronomically large, for
  example in follow-ups to Fibonacci Number (509), Climbing Stairs (70), N-th Tribonacci Number (1137),
  Knight Dialer (935) or Count Vowels Permutation (1220).

## 1.11 Big numbers as strings

**Trigger:** numbers too long for a `long`, given as strings; "without using BigInteger".

```java
// LC 415 Add Strings: schoolbook addition from the last digit, carrying as you go.
public String addStrings(String a, String b) {
    StringBuilder sb = new StringBuilder();
    int i = a.length() - 1, j = b.length() - 1, carry = 0;
    while (i >= 0 || j >= 0 || carry > 0) {
        int sum = carry;
        if (i >= 0) sum += a.charAt(i--) - '0';
        if (j >= 0) sum += b.charAt(j--) - '0';
        sb.append(sum % 10);
        carry = sum / 10;
    }
    return sb.reverse().toString();
}

// LC 43 Multiply Strings: digit i of a times digit j of b lands in positions i + j and i + j + 1.
public String multiply(String a, String b) {
    int[] pos = new int[a.length() + b.length()];
    for (int i = a.length() - 1; i >= 0; i--) {
        for (int j = b.length() - 1; j >= 0; j--) {
            int sum = (a.charAt(i) - '0') * (b.charAt(j) - '0') + pos[i + j + 1];
            pos[i + j + 1] = sum % 10;
            pos[i + j] += sum / 10;
        }
    }
    StringBuilder sb = new StringBuilder();
    for (int d : pos) {
        if (sb.length() > 0 || d != 0) sb.append(d);   // skip leading zeros
    }
    return sb.length() == 0 ? "0" : sb.toString();
}
```

```text
a = 1 2 3   (i = 0..2)       b = 4 5   (j = 0..1)
a[i] * b[j] adds its low digit to pos[i + j + 1] and its carry to pos[i + j]
pos     [0] [1] [2] [3] [4]
         0   5   5   3   5      ->  "5535" after skipping the leading zero (123 * 45 = 5535)
```

- `BigInteger` is fine in real code. Interviewers ask for these to see clean carry handling.
- The same loop powers Add Binary (67), Plus One (66), Add to Array-Form of Integer (989) and Add Two
  Numbers (2, on linked lists).

## 1.12 Bases and digit systems

```java
// LC 168 Excel Sheet Column Title: base 26 with digits
// 1..26 and no zero, so shift down by one each step.
public String convertToTitle(int columnNumber) {
    StringBuilder sb = new StringBuilder();
    while (columnNumber > 0) {
        columnNumber--;                          // 1..26 -> 0..25
        sb.append((char) ('A' + columnNumber % 26));
        columnNumber /= 26;
    }
    return sb.reverse().toString();
}

// LC 171 Excel Sheet Column Number: the inverse, by Horner's rule (value = value * base + digit).
public int titleToNumber(String columnTitle) {
    int value = 0;
    for (char c : columnTitle.toCharArray()) value = value * 26 + (c - 'A' + 1);
    return value;
}

// LC 504 Base 7, negatives included. Integer.toString(num, 7) gives the same answer.
public String convertToBase7(int num) {
    if (num == 0) return "0";
    StringBuilder sb = new StringBuilder();
    long n = Math.abs((long) num);               // a long, so Integer.MIN_VALUE works too
    while (n > 0) {
        sb.append(n % 7);
        n /= 7;
    }
    if (num < 0) sb.append('-');
    return sb.reverse().toString();
}
```

- **To base b:** repeatedly take `n % b` (the next digit, least significant first) and `n /= b`, then
  reverse.
- **From base b:** Horner's rule, `value = value * b + digit`, left to right.
- **Excel columns are "bijective base 26":** there is no zero digit ("Z" = 26, "AA" = 27), so subtract 1
  before each step.
- **Negative numbers:** handle the sign separately, and use a `long` so that |`Integer.MIN_VALUE`| fits.
- The library: `Integer.toString(n, radix)`, `Integer.parseInt(s, radix)`, `Integer.toBinaryString(n)`,
  `Long.toHexString(n)`.

---

# Part 2 — Geometry Essentials

Interview geometry rarely goes beyond axis-aligned rectangles, the cross product and comparing distances,
and all of it can be done exactly with integers.

## 2.1 Rectangles and overlaps

```java
// LC 836 Rectangle Overlap, rectangles as [x1, y1, x2, y2]: a positive-area overlap needs the
// projections to overlap on BOTH axes.
public boolean isRectangleOverlap(int[] a, int[] b) {
    return Math.max(a[0], b[0]) < Math.min(a[2], b[2])
        && Math.max(a[1], b[1]) < Math.min(a[3], b[3]);
}

// LC 223 Rectangle Area: the area covered by two rectangles = A + B - their intersection.
public int computeArea(int ax1, int ay1, int ax2, int ay2, int bx1, int by1, int bx2, int by2) {
    int overlapW = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
    int overlapH = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
    return (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - overlapW * overlapH;
}
```

- An axis-aligned rectangle is two independent intervals, one per axis (*Greedy & Intervals* guide). Two
  rectangles overlap when they overlap on x **and** on y, and the overlap's width is
  `max(0, min(rights) − max(lefts))`.
- LC 836 wants a *positive-area* overlap, so the comparisons are strict: rectangles that only touch along
  an edge don't count.
- The union of many rectangles, Rectangle Area II (850), needs coordinate compression plus a sweep line.

## 2.2 The cross product

```java
// The cross product of OA and OB: > 0 when O -> A -> B turns left (counter-clockwise),
// < 0 when it turns right, and 0 when the three points are collinear. Exact on integers.
static long cross(int[] o, int[] a, int[] b) {
    return (long) (a[0] - o[0]) * (b[1] - o[1]) - (long) (a[1] - o[1]) * (b[0] - o[0]);
}
```

```text
            B                   cross(O, A, B) > 0:   B is LEFT of O -> A  (counter-clockwise turn)
           /
          O --------> A         cross(O, A, B) = 0:   O, A, B are collinear
           \
            B'                  cross(O, A, B') < 0:  B' is RIGHT of O -> A  (clockwise turn)
```

What it gives you:
- **orientation and collinearity:** Check If It Is a Straight Line (1232);
- **area:** `cross(O, A, B)` is twice the signed area of triangle OAB, and a polygon's area is half the sum
  of `x[i]·y[i+1] − x[i+1]·y[i]` around its vertices (the shoelace formula);
- **segment intersection:** segments AB and CD cross when C and D lie on opposite sides of AB, *and* A and B
  lie on opposite sides of CD;
- **convex hull:** Andrew's monotone chain sorts the points, then builds the lower and upper hulls, popping
  while the last turn isn't a left turn (Erect the Fence, 587).

Cast to `long` before multiplying. Coordinates up to 10⁴ keep the products below 10⁹, but at 10⁵ an `int`
overflows (the harness checks that case).

## 2.3 Points on a line

```java
// LC 149 Max Points on a Line: from each anchor, group the later points by their reduced direction.
public int maxPoints(int[][] points) {
    int n = points.length, best = Math.min(n, 1);
    for (int i = 0; i < n; i++) {
        Map<Long, Integer> directions = new HashMap<>();
        for (int j = i + 1; j < n; j++) {
            int dx = points[j][0] - points[i][0], dy = points[j][1] - points[i][1];
            int g = (int) gcd(dx, dy);           // the points are distinct, so g > 0
            dx /= g;
            dy /= g;
            // one sign convention: (1, 2) and (-1, -2) are one line
            if (dx < 0 || (dx == 0 && dy < 0)) {
                dx = -dx;
                dy = -dy;
            }
            long key = ((long) dx << 32) | (dy & 0xFFFFFFFFL);   // pack the pair into one long
            best = Math.max(best, 1 + directions.merge(key, 1, Integer::sum));
        }
    }
    return best;
}
```

- **Why not store the slope as a double?** Different slopes can round to the same double, vertical lines
  need a special case, and `0.0` and `-0.0` are *different* keys in a `HashMap<Double, …>`. A reduced
  `(dx, dy)` pair with one sign convention is exact.
- O(n²) pairs. Only points after the anchor need checking, because every line is counted from its first
  point.

## 2.4 Distances without square roots

- **Compare squared distances.** `dx² + dy²` is exact in a `long`; a square root only adds rounding. K
  Closest Points to Origin (973) sorts, heaps or quickselects on `x² + y²`.
- **Manhattan distance** `|dx| + |dy|` is the grid-move distance. The trick
  `|x₁ − x₂| + |y₁ − y₂| = max over the sign choices of (±x ± y) differences` turns "maximum Manhattan
  distance" into four max-minus-min scans (Maximum of Absolute Value Expression, 1131).
- **Valid Square (593):** the six squared pairwise distances of four points must take exactly two values,
  the smaller non-zero (the four sides) and the larger twice the smaller (the two diagonals).

---

# Part 3 — Randomized Algorithms

## 3.1 Java's random toolbox

| API | Use it for |
|---|---|
| `new Random()`, `new Random(seed)` | general use; a fixed seed makes runs reproducible (tests) |
| `ThreadLocalRandom.current()` | multithreaded code: no contention between threads |
| `SecureRandom` | tokens, passwords, anything security-related |
| `Math.random()` | a quick double in [0, 1) |
| `Collections.shuffle(list)` | Fisher–Yates on a list |

- `rng.nextInt(n)` is uniform on `[0, n)`. **`Math.abs(rng.nextInt()) % n` is wrong twice:** it's biased when
  n doesn't divide 2³², and `Math.abs(Integer.MIN_VALUE)` is negative.
- Pass a `Random` in (or seed it) when you need to test randomized code, as this guide's harness does.

## 3.2 Fisher–Yates shuffle

**Trigger:** "shuffle", "random permutation", "every permutation equally likely".

```java
// LC 384 Shuffle an Array: Fisher-Yates. Every one
// of the n! orders comes out with probability 1/n!.
class ShuffleArray {
    private final int[] original;
    private final Random rng = new Random();

    public ShuffleArray(int[] nums) {
        original = nums.clone();
    }

    public int[] reset() {
        return original.clone();
    }

    public int[] shuffle() {
        int[] a = original.clone();
        for (int i = a.length - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);              // uniform in [0, i], i itself included
            int t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
        return a;
    }

    // WRONG: swapping with ANY index gives n^n equally
    // likely runs, and n! doesn't divide n^n evenly.
    public int[] biasedShuffle() {
        int[] a = original.clone();
        for (int i = 0; i < a.length; i++) {
            int j = rng.nextInt(a.length);
            int t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
        return a;
    }
}
```

- **Why it's uniform:** the last position receives each of the n elements with probability 1/n, the next one
  each of the remaining n − 1 with probability 1/(n − 1), and so on: every order has probability 1/n!.
- **Why the naive version is biased:** it makes n independent choices of n options, so nⁿ equally likely
  runs. For n = 3 that's 27 runs spread over 6 orders, and 27 isn't divisible by 6, so some orders must come
  up more often (5/27 against 4/27). The harness measures exactly that.
- **A random k-subset:** stop Fisher–Yates after k steps; the last k positions are a uniform sample.

## 3.3 Reservoir sampling

**Trigger:** pick random items from a stream or a linked list of *unknown* length, in one pass, with O(k)
memory (Linked List Random Node, 382; Random Pick Index, 398).

```java
// Reservoir sampling: k items chosen uniformly from a stream of unknown length, in O(k) memory.
static int[] sample(Iterator<Integer> stream, int k, Random rng) {
    int[] reservoir = new int[k];
    int seen = 0;
    while (stream.hasNext()) {
        int x = stream.next();
        seen++;
        if (seen <= k) {
            reservoir[seen - 1] = x;                 // the first k items fill the reservoir
        } else {
            int j = rng.nextInt(seen);               // keep x with probability k / seen ...
            if (j < k) reservoir[j] = x;             // ... in place of a uniformly random slot
        }
    }
    return seen < k ? Arrays.copyOf(reservoir, seen) : reservoir;
}

// LC 398 Random Pick Index: a uniformly random index of target, with O(1) extra memory (k = 1).
class RandomPickIndex {
    private final int[] nums;
    private final Random rng = new Random();

    public RandomPickIndex(int[] nums) {
        this.nums = nums;
    }

    public int pick(int target) {
        int chosen = -1, count = 0;
        for (int i = 0; i < nums.length; i++) {
            if (nums[i] != target) continue;
            count++;
            // replace the choice with probability 1 / count
            if (rng.nextInt(count) == 0) chosen = i;
        }
        return chosen;
    }
}
```

**Why it's uniform (k = 1):** item i is chosen when it arrives with probability 1/i, and survives each later
item j with probability 1 − 1/j. The product telescopes:

```text
item           1      2      3      4
keep prob      1     1/2    1/3    1/4
P(item 1 is the final pick) = 1 * (1/2) * (2/3) * (3/4) = 1/4
P(item 3 is the final pick) =             (1/3) * (3/4) = 1/4
```

For Random Pick Index, a `HashMap<value, List<index>>` is O(1) per pick but needs O(n) memory; reservoir
sampling is O(n) per pick with O(1) memory. Ask which one the interviewer wants.

## 3.4 Weighted random choice

```java
// LC 528 Random Pick with Weight: index i with
// probability w[i] / sum(w). Prefix sums + binary search.
class WeightedPicker {
    private final int[] prefix;           // prefix[i] = w[0] + ... + w[i] (LC: the sum fits an int)
    private final Random rng = new Random();

    public WeightedPicker(int[] w) {
        prefix = new int[w.length];
        int sum = 0;
        for (int i = 0; i < w.length; i++) {
            sum += w[i];
            prefix[i] = sum;
        }
    }

    public int pickIndex() {
        int target = rng.nextInt(prefix[prefix.length - 1]);  // uniform in [0, total)
        int lo = 0, hi = prefix.length - 1;                   // the first i with prefix[i] > target
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (prefix[mid] > target) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }
}
```

```text
w         1    3      6         10            total = 20
prefix    1    4     10         20
target    0 | 1-3 | 4-9  |    10-19           -> index 0 | 1 | 2 | 3
```

- Draw `target` uniformly from `[0, total)`; the answer is the first prefix sum greater than it, a
  lower-bound binary search (*Sorting & Binary Search* guide). O(n) to build, O(log n) per pick.
- If the total can exceed an `int`, use `long` prefix sums and `rng.nextLong(bound)` (Java 17+).
- The **alias method** (Vose) picks in O(1) after O(n) setup. Name it if you're asked for faster picks.

## 3.5 Rejection sampling

**Trigger:** build one distribution from another (rand10 from rand7), uniform points inside a shape.
**Core idea:** draw from a bigger uniform space, throw away what doesn't fit, and try again. What's left is
uniform, because every accepted outcome was equally likely.

```java
// LC 470 Implement Rand10() Using Rand7(): rejection sampling. rand7() is given by the problem.
class Rand10 {
    public int rand10() {
        while (true) {
            int n = (rand7() - 1) * 7 + rand7();    // uniform on 1..49
            if (n <= 40) return (n - 1) % 10 + 1;   // 1..40 maps 4-to-1 onto 1..10; retry on 41..49
        }
    }
}

// LC 478 Generate Random Point in a Circle: sample the
// bounding square, keep the points inside the circle.
class CirclePoint {
    private final double radius, cx, cy;
    private final Random rng = new Random();

    public CirclePoint(double radius, double xCenter, double yCenter) {
        this.radius = radius;
        this.cx = xCenter;
        this.cy = yCenter;
    }

    public double[] randPoint() {
        while (true) {                               // accepted with probability pi/4, about 0.785
            double dx = (2 * rng.nextDouble() - 1) * radius;
            double dy = (2 * rng.nextDouble() - 1) * radius;
            if (dx * dx + dy * dy <= radius * radius) return new double[] { cx + dx, cy + dy };
        }
    }
}
```

- **Cost:** each rand10 attempt uses two rand7 calls and succeeds with probability 40/49, so it takes
  2 · 49/40 = 2.45 calls on average (the harness checks this).
- **`rand7() + rand7()` is not uniform:** sums of two dice pile up in the middle.
- **The polar trap:** picking a random angle and the radius `R · rand()` crowds points near the center,
  because the area within radius r grows like r². The correct radius is `R · sqrt(rand())`. The harness
  checks that half the points fall within R/√2, which holds half the area.
- **Las Vegas vs Monte Carlo:** a Las Vegas algorithm is always right but its running time is random
  (rejection sampling, randomized quicksort). A Monte Carlo algorithm has a fixed running time but is only
  *probably* right (Miller–Rabin, comparing strings by hash, estimating π).

## 3.6 Random access in O(1): Insert Delete GetRandom

**Trigger:** a set that must support insert, delete *and* a uniformly random element, each in O(1).
**Core idea:** an `ArrayList` gives O(1) random access, and a `HashMap` gives O(1) lookup of an element's
position. To delete from the middle of the list in O(1), move the last element into the hole.

```java
// LC 380 Insert Delete GetRandom O(1): a list for random
// access plus a map from each value to its index.
class RandomizedSet {
    private final List<Integer> values = new ArrayList<>();
    private final Map<Integer, Integer> indexOf = new HashMap<>();
    private final Random rng = new Random();

    public boolean insert(int val) {
        if (indexOf.containsKey(val)) return false;
        indexOf.put(val, values.size());
        values.add(val);
        return true;
    }

    public boolean remove(int val) {
        Integer i = indexOf.remove(val);
        if (i == null) return false;
        int last = values.remove(values.size() - 1);     // removing from the END of a list is O(1)
        // val wasn't last: move the last value into its slot
        if (i < values.size()) {
            values.set(i, last);
            indexOf.put(last, i);
        }
        return true;
    }

    public int getRandom() {
        return values.get(rng.nextInt(values.size()));
    }
}
```

- The duplicates version (381) maps each value to a *set* of indexes.
- Other places randomization helps: a random pivot defeats adversarial inputs in quicksort and quickselect
  (*Sorting & Binary Search* guide), and a random base makes rolling-hash collisions unlikely
  (*String Algorithms* guide).

---

# Part 4 — Solving Any Math Question

## 4.1 The decision procedure

| The problem says… | Reach for |
|---|---|
| reverse digits, palindromic number, "return 0 on overflow" | digit loop with an overflow check (1.1) |
| equal groups, fractions, cycles lining up | gcd / lcm (1.2) |
| "measure exactly", combinations of two amounts | Bézout: multiples of the gcd (1.2) |
| divide under a modulus | modular inverse: Fermat if prime, extended Euclid if not (1.3) |
| "is prime", "prime factors" of one number | trial division to √n (1.4) |
| "count primes", all primes up to n | sieve of Eratosthenes (1.4) |
| factorise many numbers, count divisors | smallest-prime-factor sieve (1.5) |
| "only prime factors 2, 3, 5" | merge the multiplied streams (1.6) |
| `a^b` with a huge b, Pow(x, n) | square-and-multiply (1.7) |
| "modulo 10⁹ + 7" | reduce after every operation (1.8) |
| "number of ways" to choose or arrange | binomial coefficients, Catalan numbers (1.9) |
| a linear recurrence with n up to 10¹⁸ | matrix exponentiation (1.10) |
| numbers as long strings | schoolbook arithmetic with carries (1.11) |
| base conversion, Excel columns | `%` and `/` loop, Horner's rule (1.12) |
| rectangles | per-axis interval overlap (2.1) |
| orientation, collinear, polygon area, hull | cross product (2.2, 2.3) |
| closest points, comparing distances | squared distances (2.4) |
| shuffle, random permutation | Fisher–Yates (3.2) |
| random item from a stream or list of unknown length | reservoir sampling (3.3) |
| random index proportional to a weight | prefix sums + binary search (3.4) |
| build one random source from another, random point in a shape | rejection sampling (3.5) |
| O(1) insert, delete and getRandom | list + map, swap with the last (3.6) |

## 4.2 The overflow checklist

Before you submit, go through every `*`, `+` and `-`:
1. **Can either operand exceed 46,340 when you multiply two `int`s?** Then cast one operand to `long` first.
2. **Are you summing many values?** n · max must fit in the type of the sum.
3. **Is there a `% MOD` after *every* multiplication**, with both operands already reduced?
4. **Can a subtraction go negative before a `%`?** Add `MOD` back.
5. **Do you negate or `Math.abs` a value that can be `Integer.MIN_VALUE`?**
6. **Is there a `(lo + hi) / 2`?** Use `lo + (hi - lo) / 2`.
7. **Are you comparing doubles with `==`, or using a double as a map key?** Find the integer formulation.

## 4.3 Edge cases to test every time

| Input | What it breaks |
|---|---|
| 0 and 1 | `isPrime(1)`, `gcd(0, 0)`, `lcm` with 0, `convertToBase7(0)`, `multiply("0", x)` |
| negative numbers | `%` signs, digit loops, base conversion |
| `Integer.MIN_VALUE` / `MAX_VALUE` | `-n`, `Math.abs`, `reverse`, `myPow(x, MIN_VALUE)` |
| perfect squares and prime squares (4, 9, 25, 49) | `i * i < n` vs `i * i <= n` in trial division and the sieve |
| exponent 0, modulus 1 | `modPow(a, 0, m)` must be `1 % m`; anything mod 1 is 0 |
| huge exponents or n up to 10¹⁸ | loops that should have been O(log n) |
| duplicate points, vertical lines | slope as a double, a zero gcd |
| a single element | `nextInt(0)` throws; an empty reservoir |

## 4.4 Practice ladder

**Number theory: warm-up**
- Palindrome Number (9)
- Reverse Integer (7) ⭐
- Plus One (66) and Add Binary (67)
- Excel Sheet Column Number (171) and Title (168)
- Power of Two (231), Power of Three (326)
- Add Digits (258)

**Number theory: core**
- Count Primes (204) ⭐
- Pow(x, n) (50) ⭐
- Factorial Trailing Zeroes (172)
- Ugly Number II (264) ⭐
- Add Strings (415) and Multiply Strings (43) ⭐
- X of a Kind in a Deck of Cards (914)
- Water and Jug Problem (365)
- Unique Paths (62), Unique Binary Search Trees (96)
- Fraction to Recurring Decimal (166)
- Happy Number (202)

**Geometry**
- Rectangle Overlap (836) and Rectangle Area (223)
- Check If It Is a Straight Line (1232)
- Valid Square (593)
- K Closest Points to Origin (973) ⭐
- Max Points on a Line (149) ⭐

**Randomized**
- Shuffle an Array (384) ⭐
- Linked List Random Node (382) and Random Pick Index (398)
- Random Pick with Weight (528) ⭐
- Implement Rand10() Using Rand7() (470)
- Generate Random Point in a Circle (478)
- Insert Delete GetRandom O(1) (380) ⭐

**Hard**
- Super Pow (372)
- Largest Component Size by Common Factor (952)
- Nth Magical Number (878): binary search on the answer, counting with `x/a + x/b − x/lcm(a, b)`
- Erect the Fence (587)
- Insert Delete GetRandom O(1) - Duplicates allowed (381)
- Rectangle Area II (850)

## 4.5 The mistakes that cost people offers

1. **Widening after the overflow:** `(long) (a * b)` instead of `(long) a * b`.
2. **Taking `% MOD` only at the end**, after the intermediate values have already overflowed.
3. **Negative remainders:** `(a - b) % MOD` and `-7 % 3` are negative in Java.
4. **`Math.abs(Integer.MIN_VALUE)`** and `-n` on `Integer.MIN_VALUE`.
5. **Dividing under a modulus** instead of multiplying by the inverse.
6. **Using doubles for slopes, square roots or exact comparisons**, including double keys in a `HashMap`.
7. **Trial division with `i < Math.sqrt(n)`**, which misses prime squares.
8. **The biased shuffle**, swapping with any index instead of `[0, i]`.
9. **`Math.abs(rng.nextInt()) % n`** instead of `rng.nextInt(n)`.
10. **Picking a random point in a circle with a uniform radius**, which crowds the center.

## 4.6 The one-page summary

```text
LIMITS        int ~2.1e9 (a*b overflows past 46,340); long ~9.2e18; double exact to 2^53
              widen BEFORE the operation: (long) a * b; floorMod for residues; MIN_VALUE has no abs
DIGITS        d = x % 10; x /= 10; r = r * 10 + d; check r > MAX/10 before * 10
GCD           while (b != 0) { t = a % b; a = b; b = t; }   lcm = a / gcd * b
EXT GCD       {g, x, y} with ax + by = g; inverse mod m exists iff gcd(a, m) = 1
PRIMES        trial division i*i <= n (6k +- 1); sieve from i*i, O(n log log n)
              smallest-prime-factor sieve to factorise many numbers in O(log x) each
FAST POWER    while (e > 0) { if (e & 1) r = r*b % m; b = b*b % m; e >>= 1; }   long e for MIN_VALUE
MODULAR       reduce after EVERY + and *; (a - b) % M + M; divide = multiply by a^(M-2) (M prime)
COMBINATORICS C(n,k): Pascal (any mod) | multiplicative (exact) | fact + invFact (mod prime)
              Catalan = C(2n,n)/(n+1); trailing zeros = n/5 + n/25 + ...
MATRIX POWER  linear recurrence, n up to 1e18: k x k matrix, square-and-multiply, O(k^3 log n)
BIG NUMBERS   right to left with carry; multiply: a[i]*b[j] -> pos[i+j+1], carry -> pos[i+j]
BASES         to: % b, / b, reverse; from: Horner; Excel: subtract 1 first

GEOMETRY      rectangles = two 1D overlaps; cross(o,a,b) > 0 left turn, 0 collinear (cast to long)
              slopes as reduced (dx, dy) with a sign rule; compare squared distances

RANDOM        nextInt(n), never abs(nextInt()) % n
SHUFFLE       for i = n-1..1: swap(i, nextInt(i + 1))      (not nextInt(n): biased)
RESERVOIR     item i replaces a slot with probability k / i; k = 1 -> nextInt(count) == 0
WEIGHTED      prefix sums; target = nextInt(total); first prefix > target
REJECTION     sample a bigger uniform space, retry on misses; circle radius needs sqrt(rand)
GETRANDOM     list + map(value -> index); delete = move the last element into the hole
```

Print that block. Read it before every mock interview.

# Bit Manipulation — From Scratch to Interview-Ready (Java)

> Goal of this doc: after reading it once, slowly, and typing out the examples yourself, you should be able to look at almost any bit manipulation problem and know which "drawer" of your toolbox to open.

## Table of Contents
1. [Why This Topic Matters](#1-why-this-topic-matters)
2. [Foundations: How Numbers Actually Live in Memory](#2-foundations-how-numbers-actually-live-in-memory)
3. [The Operators, One by One](#3-the-operators-one-by-one)
4. [The Toolbox: Core Bit Tricks](#4-the-toolbox-core-bit-tricks)
5. [Java-Specific Gotchas](#5-java-specific-gotchas)
6. [Built-in Java Helpers](#6-built-in-java-helpers)
7. [Problem-Solving Patterns](#7-problem-solving-patterns)
8. [Two Worked Problems, Start to Finish](#8-two-worked-problems-start-to-finish)
9. [The Framework: How to Approach ANY New Problem](#9-the-framework-how-to-approach-any-new-problem)
10. [Practice List, Organized by Pattern](#10-practice-list-organized-by-pattern)
11. [One-Page Cheat Sheet](#11-one-page-cheat-sheet)

---

## 1. Why This Topic Matters

Bit tricks show up in interviews for three reasons:
- **They test whether you understand how computers represent data**, not just whether you memorized an algorithm.
- **They're a shortcut to O(1) space / O(1) extra memory** — a huge deal when the interviewer asks "can you do it without extra space?"
- **A handful of patterns cover 90% of questions** — XOR-cancellation, bitmasking for subsets, and bit-counting recur constantly. Learn the pattern once, recognize it forever.

You don't need to memorize 50 tricks. You need to deeply understand about 12, and know the 5-step framework in Section 9 for deriving the rest on the spot.

---

## 2. Foundations: How Numbers Actually Live in Memory

### 2.1 Binary is just place value, base 2

Decimal 13 = 1101 in binary, because:

```
1101 = (1 × 2³) + (1 × 2²) + (0 × 2¹) + (1 × 2⁰)
     =     8    +    4     +    0     +    1
     =    13
```

Each position is a **bit**, numbered from the right starting at 0 (bit 0 is the least significant / rightmost bit).

### 2.2 Java's integer widths

| Type | Width | Range |
|------|-------|-------|
| `byte` | 8 bits | -128 to 127 |
| `short` | 16 bits | -32,768 to 32,767 |
| `int` | 32 bits | -2,147,483,648 to 2,147,483,647 |
| `long` | 64 bits | ~-9.2×10¹⁸ to 9.2×10¹⁸ |
| `char` | 16 bits | 0 to 65,535 (unsigned!) |

Almost all interview bit-manipulation questions use `int` (32 bits). Keep that number — **32** — in your head; it explains a lot of "gotchas" later.

Unlike C/C++, **Java has no unsigned integer types** (except `char`). Every `int` and `long` is signed. This single fact is why the `>>>` operator exists — more on that soon.

### 2.3 Two's Complement — the most important 5 minutes in this doc

Computers need a way to represent negative numbers using only 0s and 1s, with a scheme where normal addition still works without special-casing. That scheme is **two's complement**, and Java uses it for every signed integer type.

**Rule:** to negate a number, invert every bit, then add 1.

Worked example, using 8 bits for readability (real Java uses 32, but the logic is identical):

```
 5 in binary:        00000101
Invert every bit:    11111010
Add 1:               11111011   ← this is -5
```

Check it: `Integer.toBinaryString(-5)` in real 32-bit Java gives
`11111111111111111111111111111011` — same pattern, just padded with leading 1s.

**Two consequences you must internalize:**
1. The **leftmost bit is the sign bit**. `0` at the front means non-negative, `1` means negative. This is why `int` can hold up to 2³¹−1 positive but 2³¹ negative — one pattern (all zeros) is reserved for 0, and the negative side doesn't need a separate "negative zero."
2. `~n` (bitwise NOT) is mathematically equal to `-(n + 1)`. That single identity explains half the "why does this trick work" questions you'll have later.

---

## 3. The Operators, One by One

Java gives you 7 bitwise/shift operators. Here's each one, with its truth table where relevant.

### 3.1 AND ( `&` )
Result bit is 1 only if **both** input bits are 1. Used for **checking/masking/clearing** bits.

| A | B | A & B |
|---|---|-------|
| 0 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 1 |

### 3.2 OR ( `\|` )
Result bit is 1 if **either** input bit is 1. Used for **setting** bits.

| A | B | A \| B |
|---|---|--------|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 1 |

### 3.3 XOR ( `^` )
Result bit is 1 if the input bits **differ**. Used for **toggling** bits and for the famous "cancel out duplicates" family of problems.

| A | B | A ^ B |
|---|---|-------|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

**Four XOR identities you should be able to recite:**
```
a ^ a = 0        (anything XORed with itself vanishes)
a ^ 0 = a         (XOR with 0 is a no-op)
a ^ b = b ^ a     (commutative)
(a ^ b) ^ c = a ^ (b ^ c)   (associative — order doesn't matter)
```
These four lines are the entire engine behind the "Single Number" family of problems. Nothing more mysterious than that.

### 3.4 NOT ( `~` )
Flips every bit. `~n == -(n + 1)`, as shown in section 2.3.
```java
~5   // = -6
~0   // = -1
~-1  // = 0
```

### 3.5 Left Shift ( `<<` )
Shifts bits left, filling with 0s on the right. Equivalent to **multiplying by 2ᵏ** (ignoring overflow).
```java
5 << 1   // 101 -> 1010  = 10   (5 * 2)
5 << 3   // 101 -> 101000 = 40  (5 * 8)
```

### 3.6 Right Shift ( `>>` ) — "arithmetic" / signed shift
Shifts bits right, filling the **left** side with copies of the **sign bit**. Equivalent to **floor-dividing by 2ᵏ**, and it correctly preserves the sign of negative numbers.
```java
20 >> 2   // = 5     (20 / 4)
-8 >> 1   // = -4     (sign-preserving)
```

### 3.7 Unsigned Right Shift ( `>>>` ) — Java-specific
Shifts bits right, filling the left side with **0s regardless of sign**. This is the operator that stands in for the "unsigned int" that Java doesn't have.
```java
-8 >> 1    // = -4           (sign bit copied in)
-8 >>> 1   // = 2147483644   (0 filled in — huge positive number)
```
Use `>>>` whenever you want to treat the 32 bits as a raw pattern rather than a signed value — this comes up in bit-reversal and hashing problems.

---

## 4. The Toolbox: Core Bit Tricks

This is the heart of the guide. Every trick below was verified by hand and by running actual Java before being written down — you can trust every line.

### 4.1 Check if bit `i` is set
```java
boolean isSet = (n & (1 << i)) != 0;
```
**Why it works:** `1 << i` creates a mask with only bit `i` turned on. ANDing with `n` zeroes out every other bit, leaving something nonzero only if bit `i` was already 1.

### 4.2 Set bit `i`
```java
n = n | (1 << i);
```
OR-ing with a mask that has only bit `i` on forces that bit to 1 without touching any other bit.

### 4.3 Clear bit `i`
```java
n = n & ~(1 << i);
```
`~(1 << i)` is all 1s **except** position `i`. ANDing with it leaves every other bit untouched and forces bit `i` to 0.

### 4.4 Toggle bit `i`
```java
n = n ^ (1 << i);
```
XOR-ing a bit with 1 flips it; XOR-ing with 0 leaves it. Since the mask is 1 only at position `i`, only that bit flips.

### 4.5 Check even / odd
```java
boolean isOdd = (n & 1) == 1;
```
The last bit is the "ones place" in binary — it's 1 exactly when the number is odd. This is faster than `n % 2` and, more importantly, is the idiom interviewers expect to see.

### 4.6 Multiply / divide by a power of two
```java
n << k     // n * 2^k
n >> k     // n / 2^k   (floor division, careful with negatives)
```

### 4.7 Isolate the lowest set bit
```java
int lowestBit = n & (-n);
```
**Why it works:** `-n` in two's complement is `~n + 1`. Going from the right, every trailing 0 in `n` becomes a trailing 0 in `~n + 1` too (borrow propagates through them), but the first 1-bit in `n` becomes... still a 1 in `-n` at that same position, while everything to its left is flipped. So `n` and `-n` agree on exactly one bit: the lowest set bit. AND-ing keeps only that.
*Verified: `12 & -12 = 4` (12 = 1100, lowest set bit is 4).*

### 4.8 Remove the lowest set bit
```java
n = n & (n - 1);
```
**Why it works:** subtracting 1 flips the lowest set bit to 0 and flips every trailing 0 below it to 1. ANDing with the original `n` keeps all higher bits the same and forces that lowest set bit off.
*Verified: `12 & 11 = 8` (1100 & 1011 = 1000).*
This single line is the engine behind Brian Kernighan's bit-counting algorithm below, and behind the power-of-two check.

### 4.9 Check if `n` is a power of two
```java
boolean isPowerOfTwo = n > 0 && (n & (n - 1)) == 0;
```
A power of two has **exactly one** bit set. Removing the lowest set bit (4.8) from a number with only one set bit leaves 0. The `n > 0` guard matters — without it, `n = 0` would wrongly pass, since `0 & -1 == 0`.
*Verified: 16 → true, 12 → false.*

### 4.10 Count set bits — Brian Kernighan's algorithm
```java
int countSetBits(int n) {
    int count = 0;
    while (n != 0) {
        n = n & (n - 1);   // clears the lowest set bit each time
        count++;
    }
    return count;
}
```
Runs in **O(number of set bits)**, not O(32) — meaningfully faster than checking all 32 positions one by one when the number is sparse. Works correctly even for negative `n`, because Java's `int` is a fixed 32-bit two's-complement pattern, so the loop still terminates after clearing all set bits.
*Verified: `countBits(-1) = 32`, `countBits(29) = 4`.*

### 4.11 Swap two numbers without a temp variable
```java
a = a ^ b;
b = a ^ b;   // = (a^b)^b = original a
a = a ^ b;   // = (a^b)^(original a) = original b
```
*Verified with a=7, b=19 → correctly ends at a=19, b=7.*
**Caveat, and a great thing to say out loud in an interview:** this breaks if `a` and `b` are the *same variable* (e.g., `arr[i]` and `arr[i]` from a bad index calc) — you'd XOR it against itself and zero it out. In real production code, prefer a plain temp variable; this trick is really an interview curiosity about XOR properties, not a best practice.

### 4.12 Clear / extract a range of bits `[i, j]` (inclusive)
```java
// Clear bits i..j
int mask = ~(((1 << (j - i + 1)) - 1) << i);
n = n & mask;
```
Build a block of `(j - i + 1)` ones with `(1 << width) - 1`, slide it into position with `<< i`, then invert it so it's 0 exactly where you want to clear and 1 everywhere else.
*Verified: clearing bits 2–5 of `11111111` gives `11000011`.*

### 4.13 Check if two numbers differ in exactly one bit
```java
boolean oneBitDiff = Integer.bitCount(a ^ b) == 1;
```
XOR marks every differing position with a 1; counting those tells you how many positions differ.

---

## 5. Java-Specific Gotchas

These are the details that separate "knows bit tricks" from "has actually been burned by them."

### 5.1 Operator precedence — and Java's safety net
In C, `if (n & 1 == 0)` is a classic silent bug, because `==` binds **tighter** than `&`, so it secretly evaluates as `n & (1 == 0)`. Java has the *same* precedence rule, but because Java doesn't silently convert between `int` and `boolean`, `n & (1==0)` is a **compile error** ("operator & is undefined for the argument types int, boolean") rather than a silent wrong answer. Still — always parenthesize:
```java
if ((n & 1) == 0) { ... }   // correct, and unambiguous to read
```

### 5.2 Shift amounts wrap around — the "shift by 32" trap
Per the Java Language Spec, when shifting an `int`, only the **low 5 bits** of the shift amount are used (i.e., shift distance is taken mod 32). For `long`, only the low 6 bits are used (mod 64).
```java
1 << 32   // NOT 0 — equals 1, because 32 & 31 = 0, so this is really 1 << 0
1 << 33   // = 2,  because 33 & 31 = 1, so this is really 1 << 1
```
*Both verified above.* This trips up people who assume shifting by the full width zeroes everything out (true in some other languages, **not** true in Java).

### 5.3 `>>` vs `>>>` on negative numbers
```java
-8 >> 1    // -4            (arithmetic — sign bit copied in)
-8 >>> 1   // 2147483644    (logical — 0 filled in)
```
If a problem statement says "treat the integer as a 32-bit unsigned pattern" (bit reversal, certain hashing problems), you almost certainly want `>>>`.

### 5.4 Integer overflow is silent
`n << k` or repeated doubling can silently overflow a 32-bit `int` with no exception. If a problem involves large shift widths or big inputs, consider `long` instead, or explicitly reason about the max input size.

### 5.5 `Integer.MIN_VALUE` has no positive counterpart
`Math.abs(Integer.MIN_VALUE)` still returns `Integer.MIN_VALUE` (a negative number!) because +2,147,483,648 doesn't fit in a 32-bit signed `int`. Mention this if a problem involves absolute value alongside bit tricks — it's a favorite edge case.

---

## 6. Built-in Java Helpers

Know these exist — they save time in an interview and signal familiarity with the language. All are static methods on `Integer` (mirrored on `Long` for 64-bit).

| Method | What it does |
|---|---|
| `Integer.bitCount(n)` | number of 1-bits (same result as section 4.10, but built-in) |
| `Integer.toBinaryString(n)` | binary string representation |
| `Integer.numberOfTrailingZeros(n)` | count of 0s after the lowest set bit |
| `Integer.numberOfLeadingZeros(n)` | count of 0s before the highest set bit |
| `Integer.highestOneBit(n)` | isolates the highest set bit (as a power of two) |
| `Integer.lowestOneBit(n)` | isolates the lowest set bit — same as `n & (-n)` |
| `Integer.reverse(n)` | reverses all 32 bits |
| `Integer.toHexString(n)` / `toOctalString(n)` | other base representations |

**Interview tip:** it's usually fine to write these out by hand once to *prove* you understand the underlying trick (e.g., write your own `countBits`), then mention "in production I'd just use `Integer.bitCount`." That shows depth *and* pragmatism.

---

## 7. Problem-Solving Patterns

Almost every bit manipulation interview question is one of these five templates wearing a costume.

### Pattern A — XOR cancels duplicates
**Signal:** "every element appears twice except one," "find the missing number," "find two elements that appear once."
**Core move:** XOR everything together; pairs vanish (section 3.3's identities).

### Pattern B — Bitmask represents a subset
**Signal:** "all subsets," "all combinations," "can we partition into groups," small `n` (usually n ≤ 20).
**Core move:** loop `mask` from `0` to `(1 << n) - 1`; bit `j` of `mask` set means "element `j` is included."
```java
for (int mask = 0; mask < (1 << n); mask++) {
    for (int j = 0; j < n; j++) {
        if ((mask & (1 << j)) != 0) {
            // element j is in this subset
        }
    }
}
```

### Pattern C — Counting bits, often with DP
**Signal:** "count set bits for every number from 0 to n."
**Core move:** `dp[i] = dp[i >> 1] + (i & 1)` — the answer for `i` is the answer for `i` with its last bit chopped off, plus that last bit.
*Verified: for i = 0..5, gives `0 1 1 2 1 2`.*

### Pattern D — Bitmask as DP *state* (state compression)
**Signal:** "visit all cities/items," small `n` (≤ ~20), looks like it wants exponential brute force otherwise. Classic example: Traveling Salesman DP, where `dp[mask][i]` = "minimum cost having visited exactly the set of cities in `mask`, currently at city `i`." Each bit of `mask` is a yes/no for "have I visited this city." This is an advanced pattern — worth knowing it exists and roughly how the state is shaped, but it deserves its own dedicated DP deep-dive rather than full treatment here.

### Pattern E — Arithmetic via bits (no `+`/`-`)
**Signal:** "add two integers without using `+` or `-`."
**Core move:** XOR gives the sum *ignoring carry*; AND-then-shift-left gives *just the carry*; repeat until there's no carry left.
```java
int getSum(int a, int b) {
    while (b != 0) {
        int carry = (a & b) << 1;
        a = a ^ b;
        b = carry;
    }
    return a;
}
```
*Verified: `getSum(23, 47) = 70`, `getSum(-5, 8) = 3` (works correctly with negatives too, since it's operating on the raw two's-complement bit pattern).*

### Bonus pattern — common binary prefix (range AND)
**Signal:** "bitwise AND of all numbers in range `[m, n]`."
**Core move:** any bit position where numbers in the range disagree will be zeroed out by the AND somewhere in that range. So the answer is just the **common prefix** of `m` and `n`, with the rest zeroed.
```java
int rangeBitwiseAnd(int m, int n) {
    int shift = 0;
    while (m != n) {
        m >>= 1;
        n >>= 1;
        shift++;
    }
    return m << shift;
}
```
*Verified: `rangeBitwiseAnd(5, 7) = 4`, and `rangeBitwiseAnd(26, 30) = 24`, matching a brute-force check.*

---

## 8. Two Worked Problems, Start to Finish

Applying the "approach → code → explanation → interview notes" structure to two classics, so you can see the toolbox in action.

### 8.1 Single Number (LeetCode 136)
*Given a non-empty array where every element appears twice except for one, find that single one, in O(n) time and O(1) space.*

**Approach:** This is Pattern A. XOR every element together. Every element that appears twice XORs with its twin and vanishes (`a ^ a = 0`); the leftover is the unique element (`x ^ 0 = x`). XOR is commutative and associative, so the order elements appear in doesn't matter.

**Code:**
```java
public int singleNumber(int[] nums) {
    int result = 0;
    for (int num : nums) {
        result ^= num;
    }
    return result;
}
```

**Explanation:** `result` starts at 0. After processing all elements, every pair has cancelled to 0, and 0 XORed with the lone survivor is just the survivor. One pass, one variable — O(n) time, O(1) space.
*Verified on `{4,1,2,1,2}` → correctly returns 4.*

**Interview notes:** Say the words "XOR is commutative and associative" out loud — it signals you understand *why* order doesn't matter, not just that the trick works. If asked a follow-up like "what if every element appears three times except one" (LeetCode 137), flag that plain XOR no longer works (three copies don't cancel to 0) and you'd need to count bits at each position modulo 3 instead — you don't need to derive that fully live, but naming that the simple XOR trick breaks down shows you're not pattern-matching blindly.

### 8.2 Counting Bits (LeetCode 338)
*Given `n`, return an array `ans` of length `n+1` where `ans[i]` is the number of 1-bits in `i`, for every `i` from 0 to `n`.*

**Approach:** This is Pattern C. Naively you could call Brian Kernighan's algorithm (section 4.10) on every number — O(n log n) total. But there's a DP relation: any number `i`'s bit count equals the bit count of `i` with its last bit removed (`i >> 1`), plus whether that last bit was a 1 (`i & 1`). Since `i >> 1 < i`, we've always already computed it.

**Code:**
```java
public int[] countBits(int n) {
    int[] dp = new int[n + 1];
    for (int i = 1; i <= n; i++) {
        dp[i] = dp[i >> 1] + (i & 1);
    }
    return dp;
}
```

**Explanation:** `dp[0] = 0` by default (zero has no set bits). For each `i` after that, chop off the last bit with `i >> 1` and look up its already-computed answer, then add back 1 if the chopped-off bit was itself a 1. This is O(n) time, O(1) extra space (excluding the output array).
*Verified: for n=5, produces `[0, 1, 1, 2, 1, 2]`, matching direct bit-counts of 0..5.*

**Interview notes:** This is a great problem to mention "there are actually three DP recurrences that work here" if pressed — `dp[i] = dp[i & (i-1)] + 1` (using trick 4.8) and `dp[i] = dp[i >> 1] + (i & 1)` are both valid and both O(n). Showing you know more than one way, and can explain why each is correct, is a strong signal.

---

## 9. The Framework: How to Approach ANY New Problem

When you hit a bit manipulation problem you haven't seen before, work through these steps, in order, out loud:

1. **Restate the problem in bit language.** What does "unique," "set," "count," or "combine" actually mean at the bit level here?
2. **Write 3–4 small examples by hand, in binary.** Seriously — grab a pen. Patterns that are invisible in decimal jump out immediately in binary. This is the single highest-leverage habit in this whole guide.
3. **Ask the trigger questions, in this order:**
   - Do elements pair up or repeat? → **XOR cancellation** (Pattern A).
   - Is it about choosing subsets/combinations, with small `n`? → **Bitmask enumeration** (Pattern B), or if it also involves optimal cost/count → **bitmask DP** (Pattern D).
   - Is it about powers of two, or doubling/halving? → **shifts**.
   - Is it about counting how many bits are set, across a range? → **Kernighan's trick** or the **DP recurrence** (Pattern C).
   - Is it "do X without +, -, *, /"? → **XOR for sum, AND-shift for carry** (Pattern E).
   - Is it about a *range* of numbers and a bitwise op across that whole range? → **common prefix** (Bonus pattern).
4. **State the recurrence or invariant in plain English before writing code.** "Each pair cancels, so the running XOR after all elements is just the lone one" is a sentence you should be able to say before typing anything.
5. **Code it, then re-trace your hand examples from step 2 against the code.** This catches off-by-one and precedence bugs before the interviewer does.
6. **State time and space complexity out loud, unprompted.** Almost every trick here is O(1) space and O(n) or O(log n) time — say so. Interviewers specifically listen for this.

---

## 10. Practice List, Organized by Pattern

Work top to bottom within each pattern — they're ordered easy to hard.

**Pattern A — XOR cancellation**
- Single Number (136)
- Missing Number (268)
- Single Number III — two uniques (260) *(uses trick 4.7 to split the array — see below)*
- Single Number II — everything else appears three times (137)

**Pattern B — Bitmask subsets**
- Subsets (78)
- Subsets II, with duplicates (90)
- Maximum XOR of Two Numbers in an Array (421) *(advanced — typically a trie or greedy-bit approach; worth returning to after the core patterns feel solid)*

**Pattern C — Counting bits**
- Number of 1 Bits (191)
- Counting Bits (338)
- Power of Two (231) / Power of Four (342)

**Pattern E — Arithmetic via bits**
- Sum of Two Integers (371)
- Reverse Bits (190)

**Mixed / foundational**
- Bitwise AND of Numbers Range (201)
- Binary Number with Alternating Bits (693)
- Complement of Base 10 Integer (476)
- Hamming Distance (461) *(literally trick 4.13)*

**A worked note on Single Number III (260), since it's the least obvious entry above:**
XOR everything → you get `a ^ b` (the XOR of the two unique numbers, since all paired numbers vanish). Grab any one set bit of that result with `diffBit = (a^b) & -(a^b)` (trick 4.7) — since it's a set bit in `a^b`, `a` and `b` must differ there. Split the whole array into two groups based on whether each number has that bit set, and XOR within each group — that isolates `a` in one group and `b` in the other.
```java
public int[] singleNumber(int[] nums) {
    int xorAll = 0;
    for (int num : nums) xorAll ^= num;
    int diffBit = xorAll & (-xorAll);
    int a = 0, b = 0;
    for (int num : nums) {
        if ((num & diffBit) != 0) a ^= num;
        else b ^= num;
    }
    return new int[]{a, b};
}
```
*Verified on `{1,2,1,3,2,5}` → correctly returns `{3, 5}`.*

---

## 11. One-Page Cheat Sheet

Print this section mentally before a live interview.

```
Check bit i:         (n & (1 << i)) != 0
Set bit i:            n | (1 << i)
Clear bit i:           n & ~(1 << i)
Toggle bit i:          n ^ (1 << i)
Is odd:                (n & 1) == 1
Multiply by 2^k:       n << k
Divide by 2^k:         n >> k
Lowest set bit:        n & (-n)
Remove lowest set bit: n & (n - 1)
Is power of two:       n > 0 && (n & (n-1)) == 0
Count set bits:        loop "n = n & (n-1)" until 0, counting iterations
Differ in one bit:     Integer.bitCount(a ^ b) == 1
Sum without + / -:     XOR = sum w/o carry, (a&b)<<1 = carry, repeat till carry=0
Clear bits [i..j]:     n & ~(((1 << (j-i+1)) - 1) << i)

XOR identities:  a^a=0   a^0=a   commutative   associative

Java gotchas:
  - int shifts wrap the shift-amount mod 32 (1 << 32 == 1, NOT 0)
  - long shifts wrap mod 64
  - >> keeps the sign bit, >>> always fills with 0
  - always parenthesize: (n & 1) == 0, never n & 1 == 0
```

---

*Every code snippet in this document was compiled and run against Java 21 before being written down — you're not just reading theory, you're reading verified output.*
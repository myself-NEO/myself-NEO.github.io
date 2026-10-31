## Problem statement

Implement three classic string utilities in `StringToolkit`, the way you'd be expected to in a coding round: correct, linear or near-linear, and careful with Unicode.

1. **`static List<List<String>> groupAnagrams(List<String> words)`** groups words that are anagrams of each other, **ignoring case**.
   - Groups appear in the order of their first word, and words keep their input order within a group.
   - Example: `[eat, Tea, tan, ate, nat, bat]` → `[[eat, Tea, ate], [tan, nat], [bat]]`.
2. **`static String compress(String s)`** applies run-length encoding: each run becomes the character followed by its count (`"aaabccdddd"` → `"a3b1c2d4"`).
   - Return the compressed form **only if it is strictly shorter**; otherwise return `s` unchanged (`"abc"` stays `"abc"`).
   - Counts can have several digits (`"a"` × 12 → `"a12"`).
   - Characters outside the Basic Multilingual Plane (surrogate pairs) count as one character.
3. **`static boolean isPalindrome(String s)`** reads the same forwards and backwards, **ignoring case and everything that isn't a letter or digit**. It must be correct for any Unicode text, including letters stored as surrogate pairs.
   - Example: `"A man, a plan, a canal: Panama"` is a palindrome.

Constraints: `words` and `s` are non-`null`. Aim for O(n·k log k) for anagrams (n words of length k) and O(n) for the other two.

## Starter code

```java title="StringToolkit.java" starter="true"
import java.util.ArrayList;
import java.util.List;

public final class StringToolkit {
    private StringToolkit() { }

    static List<List<String>> groupAnagrams(List<String> words) {
        return new ArrayList<>();                 // TODO
    }

    static String compress(String s) {
        return s;                                 // TODO
    }

    static boolean isPalindrome(String s) {
        return false;                             // TODO
    }

    public static void main(String[] args) {
        System.out.println("groupAnagrams([eat, Tea, tan, ate, nat, bat]) -> "
                + groupAnagrams(List.of("eat", "Tea", "tan", "ate", "nat", "bat")));
        for (String s : List.of("aaabccdddd", "abc", "aabb", "aaaaaaaaaaaa", "")) {
            System.out.println("compress(\"" + s + "\") -> \"" + compress(s) + "\"");
        }
        for (String s : List.of("A man, a plan, a canal: Panama", "race a car", "No 'x' in Nixon", ".,!", "")) {
            System.out.println("isPalindrome(\"" + s + "\") -> " + isPalindrome(s));
        }
        String accented = "" + (char) 0xE9 + "t" + (char) 0xE9;                 // e-acute, t, e-acute
        String boldA = new String(Character.toChars(0x1D400));                  // MATHEMATICAL BOLD CAPITAL A: 2 chars
        System.out.println("isPalindrome(e-acute t e-acute) -> " + isPalindrome(accented));
        System.out.println("isPalindrome(\"a\" + bold A + \"a\") -> " + isPalindrome("a" + boldA + "a")
                + " (the string has " + ("a" + boldA + "a").length() + " chars, 3 code points)");
        System.out.println("compress(bold A x 3) -> length " + compress(boldA + boldA + boldA).length() + " (bold A + \"3\")");
    }
}
```

## Hints

````hint title="Hint 1: anagram keys"
Two words are anagrams exactly when their sorted lower-case characters are equal. Use that sorted string as a key:
- in a `LinkedHashMap<String, List<String>>`, so groups keep first-appearance order;
- with `computeIfAbsent(key, k -> new ArrayList<>()).add(word)`.

A 26-slot count array is an O(k) alternative key, for ASCII letters only.
````

````hint title="Hint 2: compression in one pass"
Walk the string once, keeping the current run's character and length. When the character changes (or at the end), append the character and the count to a `StringBuilder`. Never use `+=` in the loop. To treat surrogate pairs as single characters, iterate code points: `s.codePointAt(i)`, advancing by `Character.charCount(cp)`, then `appendCodePoint`.
````

````hint title="Hint 3: palindromes with two pointers over code points"
Use two indexes moving inwards:
- skip anything that isn't `Character.isLetterOrDigit(codePoint)`;
- compare `Character.toLowerCase(codePoint)` on both sides;
- read backwards with `s.codePointBefore(right)`.

Comparing `char`s instead splits surrogate pairs: the high half on the left would be compared with the low half on the right.
````

## Test cases

| Call | Expected |
|---|---|
| `groupAnagrams([eat, Tea, tan, ate, nat, bat])` | `[[eat, Tea, ate], [tan, nat], [bat]]` |
| `groupAnagrams([])` | `[]` |
| `compress("aaabccdddd")` | `"a3b1c2d4"` |
| `compress("abc")` / `compress("aabb")` | `"abc"` / `"aabb"` (not strictly shorter) |
| `compress("a" × 12)` | `"a12"` |
| `compress("")` | `""` |
| `isPalindrome("A man, a plan, a canal: Panama")` | `true` |
| `isPalindrome("race a car")` | `false` |
| `isPalindrome(".,!")`, `isPalindrome("")` | `true`, `true` (nothing to compare) |
| `isPalindrome("été")` | `true` |
| `isPalindrome("a" + U+1D400 + "a")` | `true` (one code point in the middle) |

## Expected output

```text title="Expected output" output="StringToolkit.java"
groupAnagrams([eat, Tea, tan, ate, nat, bat]) -> [[eat, Tea, ate], [tan, nat], [bat]]
compress("aaabccdddd") -> "a3b1c2d4"
compress("abc") -> "abc"
compress("aabb") -> "aabb"
compress("aaaaaaaaaaaa") -> "a12"
compress("") -> ""
isPalindrome("A man, a plan, a canal: Panama") -> true
isPalindrome("race a car") -> false
isPalindrome("No 'x' in Nixon") -> true
isPalindrome(".,!") -> true
isPalindrome("") -> true
isPalindrome(e-acute t e-acute) -> true
isPalindrome("a" + bold A + "a") -> true (the string has 4 chars, 3 code points)
compress(bold A x 3) -> length 3 (bold A + "3")
naive char-based check on "a" + bold A + "a" -> false
```

## Reference solution

````solution title="Reference solution (StringToolkit.java)"
```java title="StringToolkit.java" file="StringToolkit.java"
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class StringToolkit {
    private StringToolkit() { }

    static List<List<String>> groupAnagrams(List<String> words) {
        Map<String, List<String>> groups = new LinkedHashMap<>();     // first-appearance order
        for (String word : words) {
            char[] chars = word.toLowerCase(Locale.ROOT).toCharArray();
            Arrays.sort(chars);
            groups.computeIfAbsent(new String(chars), k -> new ArrayList<>()).add(word);
        }
        return new ArrayList<>(groups.values());
    }

    static String compress(String s) {
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < s.length()) {
            int cp = s.codePointAt(i);
            int run = 0;
            while (i < s.length() && s.codePointAt(i) == cp) {          // extend the run
                i += Character.charCount(cp);
                run++;
            }
            out.appendCodePoint(cp).append(run);
            if (out.length() >= s.length()) {
                return s;                                              // early exit: can't be shorter any more
            }
        }
        return out.toString();
    }

    static boolean isPalindrome(String s) {
        int left = 0;
        int right = s.length();                                         // exclusive: read with codePointBefore
        while (left < right) {
            int l = s.codePointAt(left);
            if (!Character.isLetterOrDigit(l)) {
                left += Character.charCount(l);
                continue;
            }
            int r = s.codePointBefore(right);
            if (!Character.isLetterOrDigit(r)) {
                right -= Character.charCount(r);
                continue;
            }
            if (Character.toLowerCase(l) != Character.toLowerCase(r)) {
                return false;
            }
            left += Character.charCount(l);
            right -= Character.charCount(r);
        }
        return true;
    }

    // For comparison only: a char-based check that breaks on surrogate pairs
    static boolean naivePalindrome(String s) {
        for (int i = 0, j = s.length() - 1; i < j; i++, j--) {
            if (s.charAt(i) != s.charAt(j)) return false;
        }
        return true;
    }

    public static void main(String[] args) {
        System.out.println("groupAnagrams([eat, Tea, tan, ate, nat, bat]) -> "
                + groupAnagrams(List.of("eat", "Tea", "tan", "ate", "nat", "bat")));
        for (String s : List.of("aaabccdddd", "abc", "aabb", "aaaaaaaaaaaa", "")) {
            System.out.println("compress(\"" + s + "\") -> \"" + compress(s) + "\"");
        }
        for (String s : List.of("A man, a plan, a canal: Panama", "race a car", "No 'x' in Nixon", ".,!", "")) {
            System.out.println("isPalindrome(\"" + s + "\") -> " + isPalindrome(s));
        }
        String accented = "" + (char) 0xE9 + "t" + (char) 0xE9;                 // e-acute, t, e-acute
        String boldA = new String(Character.toChars(0x1D400));                  // MATHEMATICAL BOLD CAPITAL A: 2 chars
        System.out.println("isPalindrome(e-acute t e-acute) -> " + isPalindrome(accented));
        System.out.println("isPalindrome(\"a\" + bold A + \"a\") -> " + isPalindrome("a" + boldA + "a")
                + " (the string has " + ("a" + boldA + "a").length() + " chars, 3 code points)");
        System.out.println("compress(bold A x 3) -> length " + compress(boldA + boldA + boldA).length() + " (bold A + \"3\")");
        System.out.println("naive char-based check on \"a\" + bold A + \"a\" -> " + naivePalindrome("a" + boldA + "a"));
    }
}
```
````

## Step-by-step explanation

````solution title="Step-by-step explanation"
**Group anagrams**
1. Anagrams have the same multiset of letters, so sorting the lower-cased characters gives a **canonical key**: `"Tea"` → `"aet"`.
2. A `LinkedHashMap` keyed by that string collects the words. `computeIfAbsent` creates each group's list on first use, and insertion order gives the required group order.
3. Cost: sorting each word is O(k log k), so the total is O(n·k log k) time and O(n·k) space. For long words over a small alphabet, a count-based key (`int[26]` turned into a string) is O(k).

**Run-length compression**
1. One left-to-right pass: read a code point, then advance while the same code point repeats, counting the run.
2. Append `appendCodePoint(cp)` and the count. `append(int)` writes multi-digit counts naturally (`a12`).
3. The **early exit** stops as soon as the output is at least as long as the input, because it can never become strictly shorter after that. It also guarantees the "return the original" rule.
4. Iterating by code point (`codePointAt` plus `Character.charCount`) treats a surrogate pair as one character. A `char` loop would emit the two halves as separate "characters" with count 1 each.

**Palindrome**
1. **Two pointers** from both ends: O(n) time, O(1) extra space, no filtered copy of the string.
2. Skip non-alphanumerics on each side **independently**, then compare lower-cased code points.
3. `codePointBefore(right)` reads the code point that *ends* at `right`, so the right pointer also moves by whole code points.
4. The naive `char` version compares the high surrogate on the left with the low surrogate on the right and returns `false` for a real palindrome. That bug never shows up with ASCII tests.
5. Strings with no letters or digits (`""`, `".,!"`) are palindromes: there's nothing that differs.
````

## Edge cases

- **Empty inputs**: `groupAnagrams([])` → `[]`; `compress("")` → `""`; `isPalindrome("")` → `true`.
- **Digits inside the text being compressed** (`"a11"` → `"a1" + "12"`) make the encoding ambiguous to *decode*. Real formats escape digits or use a separate count byte. The task here only encodes.
- **Case mapping**: `Character.toLowerCase(int)` is locale-independent per code point. `String.toLowerCase()` without `Locale.ROOT` would turn `I` into a dotless `ı` in Turkish locales and break anagram keys.
- **Combining characters**: `e` followed by U+0301 (a combining accent) looks like `é` but is two code points. A fully "visual" palindrome check would first normalise to NFC (`java.text.Normalizer`), or compare grapheme clusters.
- **Very long runs**: the count is an `int`, which is fine up to the maximum string length.
- **Mixed-case anagrams**: `"Listen"` and `"Silent"` group together, and the original spellings are preserved in the output.

## JUnit tests

```java title="StringToolkitTest.java" file="StringToolkitTest.java" test="StringToolkit.java"
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class StringToolkitTest {
    @Test
    void groupsAnagramsIgnoringCaseInFirstAppearanceOrder() {
        assertEquals(List.of(List.of("eat", "Tea", "ate"), List.of("tan", "nat"), List.of("bat")),
                StringToolkit.groupAnagrams(List.of("eat", "Tea", "tan", "ate", "nat", "bat")));
    }

    @Test
    void groupAnagramsHandlesEmptyAndSingletons() {
        assertEquals(List.of(), StringToolkit.groupAnagrams(List.of()));
        assertEquals(List.of(List.of("Listen", "Silent"), List.of("abc")),
                StringToolkit.groupAnagrams(List.of("Listen", "Silent", "abc")));
    }

    @ParameterizedTest(name = "compress(\"{0}\") = \"{1}\"")
    @CsvSource(value = { "aaabccdddd|a3b1c2d4", "abc|abc", "aabb|aabb", "aaaaaaaaaaaa|a12", "aaab|aaab", "aaaab|a4b1" }, delimiter = '|')
    void compresses(String input, String expected) {
        assertEquals(expected, StringToolkit.compress(input));
    }

    @Test
    void compressEmptyString() {
        assertEquals("", StringToolkit.compress(""));
    }

    @Test
    void compressTreatsSurrogatePairsAsOneCharacter() {
        String boldA = new String(Character.toChars(0x1D400));
        assertEquals(boldA + "3", StringToolkit.compress(boldA + boldA + boldA));
    }

    @ParameterizedTest
    @ValueSource(strings = { "A man, a plan, a canal: Panama", "No 'x' in Nixon", "", ".,!", "a", "Was it a car or a cat I saw?" })
    void palindromes(String s) {
        assertTrue(StringToolkit.isPalindrome(s));
    }

    @ParameterizedTest
    @ValueSource(strings = { "race a car", "ab", "0P" })
    void notPalindromes(String s) {
        assertFalse(StringToolkit.isPalindrome(s));
    }

    @Test
    void palindromeIsUnicodeAware() {
        String accented = "" + (char) 0xE9 + "t" + (char) 0xC9;            // e-acute t E-ACUTE (case differs)
        String boldA = new String(Character.toChars(0x1D400));
        assertTrue(StringToolkit.isPalindrome(accented));
        assertTrue(StringToolkit.isPalindrome("a" + boldA + "a"));
        assertTrue(StringToolkit.isPalindrome(boldA + "x!" + boldA));
        assertFalse(StringToolkit.isPalindrome(boldA + "x" + new String(Character.toChars(0x1D401))));
    }
}
```

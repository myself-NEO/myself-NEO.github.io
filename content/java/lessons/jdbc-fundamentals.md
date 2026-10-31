## Concept explanation

### JDBC in one picture

**JDBC** (`java.sql`) is the standard Java API for relational databases. Your code talks to interfaces, and a vendor **driver** (PostgreSQL, MySQL, Oracle, H2…) implements them. Every Java persistence technology sits on top of it: JPA/Hibernate, Spring's `JdbcTemplate`, jOOQ, MyBatis.

| Interface | Role |
|---|---|
| `DataSource` / `DriverManager` | hand out `Connection`s. In production a **pooled** `DataSource` (HikariCP) is used |
| `Connection` | a session with the database: transactions, statements, metadata. Expensive to open, **not thread-safe** |
| `PreparedStatement` | a precompiled SQL statement with `?` parameters. **Always use it for values** |
| `Statement` | raw SQL text, only for fixed DDL and SQL without user input |
| `CallableStatement` | stored procedures |
| `ResultSet` | a cursor over query rows: `next()`, then `getString`, `getLong`, `getObject(col, Type.class)` |
| `SQLException` | errors, with `getSQLState()` (standard 5-character code) and `getErrorCode()` (vendor code) |

### The rules that matter

1. **Close everything with try-with-resources**: `Connection`, `Statement`, `ResultSet`. Leaked connections exhaust the pool.
2. **Bind values with `PreparedStatement` parameters**, never with string concatenation. That prevents **SQL injection** and lets the database reuse the execution plan.
3. **Transactions**: connections start in **auto-commit** mode (each statement is its own transaction). For multi-statement units of work:
   - call `setAutoCommit(false)`;
   - then `commit()`, or `rollback()` in the `catch`;
   - restore the auto-commit setting before returning the connection to the pool.
4. **Batch** many inserts or updates with `addBatch()`/`executeBatch()`: one network round trip instead of N.
5. **SQL `NULL`**: `getLong`/`getInt` return `0` for `NULL`. Use `getObject(col, Long.class)` or `wasNull()`.
6. **Generated keys**: `prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)`, then `getGeneratedKeys()`.

### Isolation levels (the ACID "I")

| Level | Dirty read | Non-repeatable read | Phantom |
|---|---|---|---|
| `READ_UNCOMMITTED` | possible | possible | possible |
| `READ_COMMITTED` (default in PostgreSQL, Oracle, SQL Server, H2) | – | possible | possible |
| `REPEATABLE_READ` (default in MySQL InnoDB) | – | – | possible (in the standard) |
| `SERIALIZABLE` | – | – | – |

Higher isolation means fewer anomalies, but more locking, aborted transactions and retries. Lost updates in read-modify-write code are prevented with:
- **`SELECT … FOR UPDATE`** (pessimistic locking);
- **optimistic locking**: a `version` column checked in the `UPDATE … WHERE id = ? AND version = ?`;
- atomic SQL (`SET balance = balance - ?`).

## Internal working

- **Driver discovery**: since JDBC 4, drivers register themselves through **`ServiceLoader`** (`META-INF/services/java.sql.Driver`), so `Class.forName("org.h2.Driver")` is obsolete. `DriverManager.getConnection(url)` asks each driver whether it accepts the URL (`jdbc:postgresql://…`, `jdbc:h2:mem:…`).
- **A connection** is a TCP connection to the server: TLS, authentication, session state. Opening one costs milliseconds.
  - **Connection pools** (HikariCP is the default in Spring Boot) keep a fixed set open and lend them out; `close()` on a pooled connection **returns** it to the pool.
  - Pool size should be small (often ~10-20 per instance). More connections than the database has cores mostly add contention.
- **`PreparedStatement`** sends the SQL text once and the parameters separately, with their types (server-side or client-side preparation depending on the driver). Parameters are **never parsed as SQL**, so `' OR '1'='1` is just a string value.
- **`ResultSet` fetching**: drivers fetch rows in chunks (`setFetchSize`). Some load the whole result into memory unless configured otherwise: PostgreSQL's driver streams only with auto-commit off and a fetch size set, and MySQL's needs a streaming setting. Check this before exporting large tables.
- **Transactions** live in the database. `setAutoCommit(false)` starts one at the next statement, row locks are held until `commit`/`rollback`, and constraint violations surface as `SQLException` with SQLState class **23** (integrity constraint). Some drivers throw the subclass `SQLIntegrityConstraintViolationException`.
- **Higher layers**:
  - `JdbcTemplate` removes the boilerplate (resource handling, exception translation into `DataAccessException`).
  - JPA/Hibernate maps objects to rows, generates SQL, and adds a first-level cache, dirty checking and lazy loading. It's convenient, but you must still understand the SQL it issues (N+1 queries!).

## Visual representation

```text title="A unit of work over JDBC"
 pool --getConnection--> Connection (autoCommit=true by default)
                           | setAutoCommit(false)
                           |   UPDATE account SET balance = balance + ? WHERE id = ?   (credit)   row lock
                           |   UPDATE account SET balance = balance - ? WHERE id = ?   (debit)    CHECK fails -> SQLException 23513
                           |   rollback()  -> credit undone too
                           | setAutoCommit(true)
 pool <----close()-------- returned, not destroyed

 SQL injection:  "... WHERE email = '" + input + "'"   input = nobody' OR '1'='1
                 -> WHERE email = 'nobody' OR '1'='1'    (matches every row)
 PreparedStatement:  WHERE email = ?   with ? = "nobody' OR '1'='1"   (a plain value, no match)
```

## Java code example

The examples use **H2**, an in-memory Java database, so they run anywhere. The JDBC code is identical for PostgreSQL or MySQL; only the URL and some SQL dialect details change.

```java title="JdbcDemo.java" file="JdbcDemo.java" classpath="h2"
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class JdbcDemo {
    record Customer(long id, String email, String name, Long referrerId) { }

    static final String URL = "jdbc:h2:mem:shop";

    static void createSchema(Connection c) throws SQLException {
        try (Statement st = c.createStatement()) {   // fixed DDL: a plain Statement is fine
            st.execute("""
                    CREATE TABLE customer (
                        id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        email       VARCHAR(100) NOT NULL UNIQUE,
                        name        VARCHAR(100) NOT NULL,
                        referrer_id BIGINT REFERENCES customer(id)
                    )""");
            st.execute("""
                    CREATE TABLE account (
                        customer_id   BIGINT PRIMARY KEY REFERENCES customer(id),
                        balance_cents BIGINT NOT NULL CHECK (balance_cents >= 0)
                    )""");
        }
    }

    static long insertCustomer(Connection c, String email, String name, Long referrerId) throws SQLException {
        String sql = "INSERT INTO customer (email, name, referrer_id) VALUES (?, ?, ?)";
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, email);
            ps.setString(2, name);
            ps.setObject(3, referrerId);            // setObject handles null
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }

    static List<Customer> findAll(Connection c) throws SQLException {
        List<Customer> result = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT id, email, name, referrer_id FROM customer ORDER BY id");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                result.add(new Customer(rs.getLong("id"), rs.getString("email"), rs.getString("name"),
                        rs.getObject("referrer_id", Long.class)));   // null stays null
            }
        }
        return result;
    }

    static Map<Long, Long> balances(Connection c) throws SQLException {
        Map<Long, Long> result = new LinkedHashMap<>();
        try (PreparedStatement ps = c.prepareStatement("SELECT customer_id, balance_cents FROM account ORDER BY customer_id");
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                result.put(rs.getLong(1), rs.getLong(2));
            }
        }
        return result;
    }

    static void transfer(Connection c, long from, long to, long cents) throws SQLException {
        boolean previousAutoCommit = c.getAutoCommit();
        c.setAutoCommit(false);
        try (PreparedStatement credit = c.prepareStatement("UPDATE account SET balance_cents = balance_cents + ? WHERE customer_id = ?");
             PreparedStatement debit = c.prepareStatement("UPDATE account SET balance_cents = balance_cents - ? WHERE customer_id = ?")) {
            credit.setLong(1, cents);
            credit.setLong(2, to);
            credit.executeUpdate();                 // runs first, so the rollback below has something to undo
            debit.setLong(1, cents);
            debit.setLong(2, from);
            if (debit.executeUpdate() != 1) {
                throw new SQLException("no account " + from);
            }
            c.commit();
        } catch (SQLException e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(previousAutoCommit);
        }
    }

    public static void main(String[] args) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, "sa", "")) {
            DatabaseMetaData meta = c.getMetaData();
            System.out.println("driver found via ServiceLoader: " + DriverManager.getDriver(URL).getClass().getName()
                    + ", database " + meta.getDatabaseProductName() + " " + meta.getDatabaseProductVersion());
            System.out.println("auto-commit " + c.getAutoCommit() + ", READ_COMMITTED isolation "
                    + (c.getTransactionIsolation() == Connection.TRANSACTION_READ_COMMITTED));
            createSchema(c);

            long ada = insertCustomer(c, "ada@example.com", "Ada", null);
            long bob = insertCustomer(c, "bob@example.com", "Bob", ada);
            System.out.println("generated keys: ada=" + ada + ", bob=" + bob);

            try (PreparedStatement ps = c.prepareStatement("INSERT INTO account (customer_id, balance_cents) VALUES (?, ?)")) {
                long[][] rows = { { ada, 10_000 }, { bob, 2_000 } };
                for (long[] row : rows) {
                    ps.setLong(1, row[0]);
                    ps.setLong(2, row[1]);
                    ps.addBatch();
                }
                System.out.println("batch update counts: " + Arrays.toString(ps.executeBatch()));
            }
            findAll(c).forEach(cust -> System.out.println("  " + cust));

            try (PreparedStatement ps = c.prepareStatement("SELECT referrer_id FROM customer WHERE id = ?")) {
                ps.setLong(1, ada);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    long raw = rs.getLong(1);
                    System.out.println("NULL referrer via getLong: " + raw + ", wasNull " + rs.wasNull());
                }
            }

            // SQL injection
            String input = "nobody' OR '1'='1";
            try (Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM customer WHERE email = '" + input + "'")) {
                rs.next();
                System.out.println("concatenated SQL matched " + rs.getInt(1) + " rows (injection!)");
            }
            try (PreparedStatement ps = c.prepareStatement("SELECT COUNT(*) FROM customer WHERE email = ?")) {
                ps.setString(1, input);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    System.out.println("PreparedStatement matched " + rs.getInt(1) + " rows");
                }
            }

            // Constraint violations
            try {
                insertCustomer(c, "ada@example.com", "Ada again", null);
            } catch (SQLIntegrityConstraintViolationException e) {
                System.out.println("duplicate email: SQLIntegrityConstraintViolationException, SQLState " + e.getSQLState());
            }

            // Transactions
            transfer(c, ada, bob, 2_500);
            System.out.println("after transfer 2500 ada->bob: " + balances(c));
            try {
                transfer(c, bob, ada, 9_999);       // bob can't cover it: CHECK constraint fails on the debit
            } catch (SQLException e) {
                System.out.println("transfer 9999 bob->ada failed, SQLState " + e.getSQLState() + ", rolled back");
            }
            System.out.println("balances unchanged (credit undone): " + balances(c) + ", auto-commit restored " + c.getAutoCommit());
        }
    }
}
```

## Output

```text title="Output" output="JdbcDemo.java"
driver found via ServiceLoader: org.h2.Driver, database H2 2.2.224 (2023-09-17)
auto-commit true, READ_COMMITTED isolation true
generated keys: ada=1, bob=2
batch update counts: [1, 1]
  Customer[id=1, email=ada@example.com, name=Ada, referrerId=null]
  Customer[id=2, email=bob@example.com, name=Bob, referrerId=1]
NULL referrer via getLong: 0, wasNull true
concatenated SQL matched 2 rows (injection!)
PreparedStatement matched 0 rows
duplicate email: SQLIntegrityConstraintViolationException, SQLState 23505
after transfer 2500 ada->bob: {1=7500, 2=4500}
transfer 9999 bob->ada failed, SQLState 23513, rolled back
balances unchanged (credit undone): {1=7500, 2=4500}, auto-commit restored true
```

- **Driver discovery**: `DriverManager` found H2's driver through `ServiceLoader`, with no `Class.forName`.
- **Generated keys and batches**: the identity values came back from `getGeneratedKeys`, and one `executeBatch` sent both account rows, returning an update count per row.
- **NULL**: `getObject(col, Long.class)` kept Ada's missing referrer as `null`, while `getLong` returned `0` and only `wasNull()` revealed the difference.
- **Injection**: the concatenated query turned the input into SQL logic and matched every row. The same text bound as a parameter matched nothing.
- **Constraints**: the duplicate email failed with SQLState **23505** (unique violation), and the overdraft with **23513** (check violation). Both are standard codes, portable across databases.
- **Transactions**: the credit to Ada had already executed when Bob's debit failed. `rollback()` undid it, so the balances are exactly as before, and the connection's auto-commit mode was restored.

## Real-world application

- **Spring applications** rarely call raw JDBC, but every layer is JDBC underneath:
  - `JdbcTemplate`/`JdbcClient`: SQL with parameter binding, row mappers, exception translation;
  - Spring Data JDBC/JPA repositories;
  - `@Transactional`: a proxy that calls `setAutoCommit(false)`, `commit` and `rollback` on a connection bound to the thread.
- **HikariCP pool tuning**: `maximumPoolSize`, `connectionTimeout`, `maxLifetime` (shorter than the database's idle timeout), and leak detection (`leakDetectionThreshold`).
- **Performance work**:
  - batching (`rewriteBatchedStatements=true` on MySQL, `reWriteBatchedInserts` on PostgreSQL);
  - fetch size for exports;
  - avoiding N+1 queries (one query per row in a loop) with joins or `IN` lists;
  - indexes matching the `WHERE` clauses.
- **Security reviews**: concatenated SQL is a top finding (OWASP A03 Injection). Dynamic identifiers like `ORDER BY` columns can't be parameters, so they must be validated against an allow-list.
- **Testing**: H2 for quick tests, but **Testcontainers** with the real database engine for fidelity, because SQL dialects and locking differ.

## Common mistakes

- **Concatenating user input into SQL**, which allows injection. Use parameters, and allow-list identifiers.
- **Not closing `ResultSet`/`Statement`/`Connection`**, which leaks cursors and pool connections. Use try-with-resources for all three.
- **Forgetting `rollback()`**, or leaving `autoCommit(false)` on a pooled connection, so the next borrower inherits an open transaction.
- **Reading `NULL` with `getInt`/`getLong`** and getting a misleading `0`.
- **Sharing a `Connection` across threads.** Connections aren't thread-safe: borrow one per unit of work.
- **Opening a new physical connection per request** instead of using a pool.
- **Read-modify-write without locking** (`SELECT balance`, compute in Java, `UPDATE`), which loses updates under concurrency. Use atomic SQL, `FOR UPDATE` or optimistic versions.
- **N+1 queries** in loops, and unbounded result sets loaded into memory.

## Interview questions

**Q1. `Statement` vs `PreparedStatement`?**

````reveal title="Answer"
`Statement` executes SQL text as given, so values must be concatenated into it. That's vulnerable to SQL injection, and the database re-parses every distinct string. `PreparedStatement` has `?` placeholders whose values are sent separately with types: no injection, and the plan can be reused (with server-side preparation or statement caching). It also handles escaping, dates and binary data, and supports batching. Use `Statement` only for fixed SQL such as DDL.
````

**Q2. How do you manage a transaction in plain JDBC?**

````reveal title="Answer"
```java
conn.setAutoCommit(false);
try {
    // several statements
    conn.commit();
} catch (SQLException e) {
    conn.rollback();
    throw e;
} finally {
    conn.setAutoCommit(true);
}
```
All statements must use the same `Connection`. Savepoints (`setSavepoint`/`rollback(savepoint)`) allow partial rollbacks. Frameworks wrap this in `@Transactional` or `TransactionTemplate` and bind the connection to the current thread.
````

**Q3. Why use a connection pool?**

````reveal title="Answer"
Opening a physical connection costs a TCP handshake, TLS, authentication and session setup: milliseconds per request. A pool keeps a bounded set of open connections, lends them out (`getConnection`) and takes them back (`close`). It also bounds the load on the database, validates connections, detects leaks and recycles old connections. Size it small (roughly cores × 2 plus effective spindles is a classic starting point): too many connections cause contention in the database.
````

**Q4. What are isolation levels and the anomalies they prevent?**

````reveal title="Answer"
- **Dirty read**: seeing uncommitted data. Prevented from `READ_COMMITTED` upwards.
- **Non-repeatable read**: the same row reads differently within one transaction. Prevented by `REPEATABLE_READ`.
- **Phantom**: a query returns new rows on re-execution. Prevented by `SERIALIZABLE`.

Most databases default to `READ_COMMITTED` (MySQL InnoDB uses `REPEATABLE_READ`). Higher levels cost concurrency or cause serialization failures that need retries. Lost updates need explicit handling: atomic updates, `SELECT … FOR UPDATE` or optimistic versioning.
````

**Q5. How do you avoid reading `0` for SQL NULL?**

````reveal title="Answer"
`rs.getInt`/`getLong`/`getDouble` return the primitive default (`0`) for `NULL`. Either call `rs.wasNull()` right after the getter, or use `rs.getObject("col", Long.class)`/`Integer.class` (JDBC 4.1), which returns `null`. For writing, `setObject(i, value)` or `setNull(i, Types.BIGINT)` stores `NULL`.
````

## Hands-on exercise

Write a small **repository** over JDBC (with H2) for a `product(id, sku UNIQUE, name, price_cents)` table:
- `Optional<Product> findBySku(String sku)`;
- `List<Product> findCheaperThan(long cents)`, ordered by price;
- `void saveAll(List<Product> products)`: a **batch insert in one transaction**. If any row fails (for example a duplicate SKU), roll back the **whole** batch and throw `IllegalStateException("batch rejected: …SQLState…")`.

Demonstrate:
1. saving three products;
2. a failing batch whose valid rows are also rolled back;
3. both finders.

````hint title="Hint"
The batch throws `BatchUpdateException` (a `SQLException`) at `executeBatch`; catch `SQLException`, call `rollback()` and wrap it. Map rows with a small `Product map(ResultSet rs)` helper.
````

````solution title="Solution"
```java title="ProductRepository.java" file="ProductRepository.java" classpath="h2"
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class ProductRepository {
    record Product(String sku, String name, long priceCents) { }

    private final Connection conn;

    ProductRepository(Connection conn) {
        this.conn = conn;
    }

    private static Product map(ResultSet rs) throws SQLException {
        return new Product(rs.getString("sku"), rs.getString("name"), rs.getLong("price_cents"));
    }

    Optional<Product> findBySku(String sku) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT sku, name, price_cents FROM product WHERE sku = ?")) {
            ps.setString(1, sku);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? Optional.of(map(rs)) : Optional.empty();
            }
        }
    }

    List<Product> findCheaperThan(long cents) throws SQLException {
        List<Product> result = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT sku, name, price_cents FROM product WHERE price_cents < ? ORDER BY price_cents, sku")) {
            ps.setLong(1, cents);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    result.add(map(rs));
                }
            }
        }
        return result;
    }

    void saveAll(List<Product> products) throws SQLException {
        boolean previous = conn.getAutoCommit();
        conn.setAutoCommit(false);
        try (PreparedStatement ps = conn.prepareStatement("INSERT INTO product (sku, name, price_cents) VALUES (?, ?, ?)")) {
            for (Product p : products) {
                ps.setString(1, p.sku());
                ps.setString(2, p.name());
                ps.setLong(3, p.priceCents());
                ps.addBatch();
            }
            ps.executeBatch();
            conn.commit();
        } catch (SQLException e) {
            conn.rollback();
            throw new IllegalStateException("batch rejected: SQLState " + e.getSQLState(), e);
        } finally {
            conn.setAutoCommit(previous);
        }
    }

    long count() throws SQLException {
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM product")) {
            rs.next();
            return rs.getLong(1);
        }
    }

    public static void main(String[] args) throws SQLException {
        try (Connection c = DriverManager.getConnection("jdbc:h2:mem:catalog", "sa", "")) {
            try (Statement st = c.createStatement()) {
                st.execute("CREATE TABLE product (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,"
                        + " sku VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL, price_cents BIGINT NOT NULL)");
            }
            ProductRepository repo = new ProductRepository(c);

            repo.saveAll(List.of(new Product("KB-1", "Keyboard", 4_999),
                    new Product("MS-1", "Mouse", 1_999),
                    new Product("MN-1", "Monitor", 18_900)));
            System.out.println("saved, count = " + repo.count());

            try {
                repo.saveAll(List.of(new Product("CB-1", "Cable", 499),          // valid row
                        new Product("KB-1", "Keyboard (dup)", 5_999)));          // duplicate SKU
            } catch (IllegalStateException e) {
                System.out.println(e.getMessage() + ", count still " + repo.count()
                        + ", CB-1 present: " + repo.findBySku("CB-1").isPresent());
            }

            System.out.println("findBySku(MS-1) = " + repo.findBySku("MS-1"));
            System.out.println("findBySku(XX-9) = " + repo.findBySku("XX-9"));
            System.out.println("cheaper than 50.00: " + repo.findCheaperThan(5_000));
        }
    }
}
```

```text title="Output" output="ProductRepository.java"
saved, count = 3
batch rejected: SQLState 23505, count still 3, CB-1 present: false
findBySku(MS-1) = Optional[Product[sku=MS-1, name=Mouse, priceCents=1999]]
findBySku(XX-9) = Optional.empty
cheaper than 50.00: [Product[sku=MS-1, name=Mouse, priceCents=1999], Product[sku=KB-1, name=Keyboard, priceCents=4999]]
```

The valid `CB-1` row was rolled back together with the duplicate, so the batch is all-or-nothing. That's the behaviour `@Transactional` gives a Spring Data `saveAll`. The repository shape (finders returning `Optional`/`List`, mapping rows in one place) is what Spring Data or `JdbcClient` generate or simplify for you.
````

## Knowledge check

```quiz
? Why does PreparedStatement prevent SQL injection?
+ Parameter values are sent separately and never parsed as SQL
- It escapes quotes in the SQL text
- It validates input against the schema
> ' OR '1'='1 becomes a plain string value.

? rs.getLong("referrer_id") is called on a NULL column. What does it return?
+ 0, and wasNull() returns true
- null
- It throws SQLException
> Use getObject(col, Long.class) to get null.

? What does close() do on a connection borrowed from a pool?
+ Returns it to the pool
- Closes the TCP connection
- Commits the transaction
> The pool keeps physical connections open.

? A transfer credits one account, then the debit fails a CHECK constraint. With autoCommit=false and rollback() in the catch, what happens?
+ Both updates are undone
- Only the debit is undone
- The credit remains committed
> The transaction is all-or-nothing.

? Which SQLState class indicates an integrity constraint violation?
+ 23 (for example 23505 for unique violations)
- 42
- 08
> 42 is syntax/access errors, 08 is connection errors.
```

## Key takeaways

- JDBC = `DataSource`/`Connection` → `PreparedStatement` → `ResultSet`, implemented by drivers discovered via `ServiceLoader`. Everything (JPA, `JdbcTemplate`) builds on it.
- **Always bind values with `PreparedStatement`** (injection, plan reuse), and **close resources with try-with-resources**.
- Group statements in **transactions** (`setAutoCommit(false)`, `commit`, `rollback`, restore). Use **batches** for bulk writes and **pools** for connections.
- Watch for SQL `NULL` (`getObject(col, Long.class)`), SQLState codes (23xxx = constraints), isolation levels and lost updates.
- Know the SQL your ORM generates: N+1 queries, missing indexes and huge result sets are JDBC-level problems.

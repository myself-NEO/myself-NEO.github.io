## Concept explanation

### Annotations are structured metadata

An **annotation** attaches metadata to a declaration (class, method, field, parameter, constructor, package, module, record component) or, since Java 8, to a **type use** (`List<@NonNull String>`). It does nothing by itself: something must **read** it.
- **The compiler** reads `@Override`, `@FunctionalInterface`, `@SuppressWarnings`, `@Deprecated`, `@SafeVarargs`.
- **Annotation processors** read annotations at **compile time** (Lombok, MapStruct, Dagger, AutoValue, Micronaut, JPA metamodel).
- **Frameworks** read them at **run time** via reflection (Spring `@Component`/`@Autowired`, JPA `@Entity`, Jackson `@JsonProperty`, JUnit `@Test`, Bean Validation `@NotNull`).

### Declaring one

```java
@Retention(RetentionPolicy.RUNTIME)      // visible to reflection
@Target(ElementType.FIELD)               // where it may appear
public @interface Range {
    long min() default Long.MIN_VALUE;   // elements look like methods; defaults allowed
    long max() default Long.MAX_VALUE;
    String message() default "out of range";
}

@Range(min = 1, max = 120) int age;      // usage
```

Rules for elements:
- Element types are limited to **primitives, `String`, `Class`, enums, other annotations, and 1-D arrays of those**.
- Values must be **compile-time constants**, and **`null` is never allowed** (use a sentinel like `""` or a `NONE` constant).
- An element named **`value`** can be set without its name: `@SuppressWarnings("unchecked")`. A single-element array can drop the braces.

### Meta-annotations

| Meta-annotation | Effect |
|---|---|
| `@Retention(SOURCE)` | discarded by the compiler (`@Override`, `@SuppressWarnings`, Lombok's annotations) |
| `@Retention(CLASS)` (**the default**) | stored in the class file but **not** visible to reflection (used by bytecode tools) |
| `@Retention(RUNTIME)` | visible via `getAnnotation` at run time (what frameworks need) |
| `@Target(...)` | allowed places: `TYPE`, `FIELD`, `METHOD`, `PARAMETER`, `CONSTRUCTOR`, `TYPE_USE`, `RECORD_COMPONENT`… (no `@Target` = most declaration contexts) |
| `@Inherited` | a **class** annotation is inherited by subclasses (not from interfaces, not on methods) |
| `@Repeatable(Container.class)` | the annotation may appear several times; the compiler wraps the repeats in the container |
| `@Documented` | included in Javadoc |

### Two ways to process them

| | Run time (reflection) | Compile time (annotation processor) |
|---|---|---|
| How | `getAnnotation`, `isAnnotationPresent`, `getAnnotationsByType` | a `javax.annotation.processing.Processor` that javac runs |
| Can | change behaviour while the program runs (DI, routing, validation) | **generate new source files**, report errors and warnings |
| Cannot | catch mistakes before run time | modify existing classes (Lombok does it through internal javac APIs, a deliberate hack) |
| Cost | start-up scanning and reflection | none at run time; GraalVM-friendly |

## Internal working

- **Storage**: annotations live in class-file attributes. `RuntimeVisibleAnnotations` is read by reflection; `RuntimeInvisibleAnnotations` is for `CLASS` retention. Parameter and type annotations have their own attributes. `SOURCE` annotations are never written.
- **Reflection**: `getAnnotation` parses the attribute lazily (and caches it), then returns an object implementing your annotation interface. That object is a **dynamic proxy** (next lesson) backed by a map of element values. It has value-based `equals`/`hashCode`, and missing elements are filled from the defaults.
- **Repeatable annotations** compile into the container: `@Role("a") @Role("b")` is stored as `@Roles({@Role("a"), @Role("b")})`. `getAnnotation(Role.class)` therefore returns **null**; use `getAnnotationsByType(Role.class)`, which looks through containers.
- **`@Inherited`**: `getAnnotation` walks up the **superclass** chain for annotation types marked `@Inherited`, while `getDeclaredAnnotations` never does.
- **Annotation processing** runs in **rounds** inside javac:
  - javac finds processors through `ServiceLoader` (`META-INF/services/javax.annotation.processing.Processor`) on the processor path, or explicitly via `-processor`. Since JDK 23, processors on the class path don't run unless enabled (`-proc:full`/`-processorpath`), because implicit processing was a security and performance risk.
  - Each round gives the processor the **elements** (`TypeElement`, `ExecutableElement`, `VariableElement`) annotated with its supported types. The processor can report via `Messager` (an `ERROR` fails the build) and generate files via `Filer`.
  - Generated sources are compiled in a further round, which repeats until no new files appear.
  - Processors work on the **language model** (`javax.lang.model`), not on `Class` objects: the classes don't exist yet.
- **Classpath scanning** (Spring's `@ComponentScan`): frameworks read **class files with ASM** to find annotations without loading the classes, and load only the matches.

## Visual representation

```text title="Where annotations go and who reads them"
  source:   @Entity @Range(min=1) @Override ...
               |
   javac  ---- round 1: processors see Elements --> Messager (errors)  Filer (new sources) --> round 2 ...
               |
   class file: RuntimeVisibleAnnotations   (RUNTIME)   --> reflection: getAnnotation(...) -> proxy object
               RuntimeInvisibleAnnotations (CLASS)     --> bytecode tools only
               (SOURCE annotations are gone)

  @Role("a") @Role("b")  ==compiles to==>  @Roles({@Role("a"), @Role("b")})
       getAnnotation(Role.class) = null      getAnnotationsByType(Role.class) = [a, b]
```

## Java code example

The first program builds a small **Bean Validation**-style validator and shows retention, inheritance and repeatable annotations at run time:

```java title="AnnotationsDemo.java" file="AnnotationsDemo.java"
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Repeatable;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class AnnotationsDemo {
    // ---- validation annotations
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.FIELD)
    @interface NotBlank {
        String message() default "must not be blank";
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.FIELD)
    @interface Range {
        long min() default Long.MIN_VALUE;
        long max() default Long.MAX_VALUE;
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.FIELD)
    @interface Pattern {
        String value();                      // "value" can be set without its name
    }

    static class SignupForm {
        @NotBlank String username;
        @NotBlank(message = "email is required") @Pattern("[^@]+@[^@]+\\.[a-z]+") String email;
        @Range(min = 13, max = 120) int age;
        String referrer;                     // not annotated: never checked

        SignupForm(String username, String email, int age) {
            this.username = username;
            this.email = email;
            this.age = age;
        }
    }

    static List<String> validate(Object bean) throws IllegalAccessException {
        List<String> violations = new ArrayList<>();
        Field[] fields = bean.getClass().getDeclaredFields();
        Arrays.sort(fields, Comparator.comparing(Field::getName));
        for (Field f : fields) {
            f.setAccessible(true);
            Object value = f.get(bean);
            NotBlank notBlank = f.getAnnotation(NotBlank.class);
            if (notBlank != null && (value == null || value.toString().isBlank())) {
                violations.add(f.getName() + ": " + notBlank.message());
                continue;
            }
            Pattern pattern = f.getAnnotation(Pattern.class);
            if (pattern != null && value != null && !value.toString().matches(pattern.value())) {
                violations.add(f.getName() + ": must match " + pattern.value());
            }
            Range range = f.getAnnotation(Range.class);
            if (range != null) {
                long n = ((Number) value).longValue();
                if (n < range.min() || n > range.max()) {
                    violations.add(f.getName() + ": must be between " + range.min() + " and " + range.max());
                }
            }
        }
        return violations;
    }

    // ---- retention
    @Retention(RetentionPolicy.SOURCE) @interface SourceOnly { }
    @interface ClassRetained { }            // no @Retention: CLASS is the default
    @Retention(RetentionPolicy.RUNTIME) @interface RuntimeVisible { }

    @SourceOnly @ClassRetained @RuntimeVisible
    static class Tagged { }

    // ---- @Inherited
    @Inherited @Retention(RetentionPolicy.RUNTIME) @Target(ElementType.TYPE)
    @interface Audited { }

    @Audited static class BaseEntity { }
    static class Customer extends BaseEntity { }

    // ---- @Repeatable
    @Retention(RetentionPolicy.RUNTIME) @interface Roles { Role[] value(); }

    @Repeatable(Roles.class) @Retention(RetentionPolicy.RUNTIME)
    @interface Role { String value(); }

    @Role("admin") @Role("auditor")
    static class AdminController {
        @Deprecated(since = "2.0", forRemoval = true)
        public void legacyExport() { }
    }

    public static void main(String[] args) throws Exception {
        System.out.println("valid form   -> " + validate(new SignupForm("ada", "ada@example.com", 36)));
        System.out.println("invalid form -> " + validate(new SignupForm(" ", "not-an-email", 7)));
        System.out.println("missing email -> " + validate(new SignupForm("bob", null, 200)));

        System.out.println("Tagged runtime annotations: "
                + Arrays.stream(Tagged.class.getAnnotations()).map(a -> a.annotationType().getSimpleName()).toList());

        System.out.println("Customer @Audited via getAnnotation: " + Customer.class.isAnnotationPresent(Audited.class)
                + ", declared on Customer itself: " + Customer.class.getDeclaredAnnotations().length);

        Class<AdminController> ctl = AdminController.class;
        System.out.println("getAnnotation(Role) = " + ctl.getAnnotation(Role.class)
                + ", container present = " + ctl.isAnnotationPresent(Roles.class)
                + ", getAnnotationsByType = " + Arrays.stream(ctl.getAnnotationsByType(Role.class)).map(Role::value).toList());

        Method legacy = ctl.getMethod("legacyExport");
        Deprecated dep = legacy.getAnnotation(Deprecated.class);
        System.out.println("legacyExport deprecated since " + dep.since() + ", forRemoval " + dep.forRemoval());

        Range range = SignupForm.class.getDeclaredField("age").getAnnotation(Range.class);
        Range same = SignupForm.class.getDeclaredField("age").getAnnotation(Range.class);
        System.out.println("annotation object is a proxy: " + Proxy.isProxyClass(range.getClass())
                + ", implements " + range.annotationType().getSimpleName()
                + ", equal by value: " + range.equals(same));
    }
}
```

The second program runs a real **annotation processor** inside `javac` (through the `javax.tools` compiler API), the same way Maven or Gradle run Lombok or MapStruct. The processor rejects any `@Entity` class without an `id` field **at compile time**:

```java title="EntityProcessorDemo.java" file="EntityProcessorDemo.java"
import java.net.URI;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import javax.annotation.processing.AbstractProcessor;
import javax.annotation.processing.RoundEnvironment;
import javax.annotation.processing.SupportedAnnotationTypes;
import javax.lang.model.SourceVersion;
import javax.lang.model.element.Element;
import javax.lang.model.element.ElementKind;
import javax.lang.model.element.TypeElement;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.ToolProvider;

public class EntityProcessorDemo {
    @SupportedAnnotationTypes("demo.Entity")
    static class EntityChecker extends AbstractProcessor {
        private int round;

        @Override
        public SourceVersion getSupportedSourceVersion() {
            return SourceVersion.latestSupported();
        }

        @Override
        public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment env) {
            round++;
            System.out.println("round " + round + ": annotations " + annotations.stream().map(a -> a.getQualifiedName().toString()).toList()
                    + (env.processingOver() ? " (final round)" : ""));
            for (TypeElement annotation : annotations) {
                env.getElementsAnnotatedWith(annotation).stream()
                        .sorted(Comparator.comparing(e -> e.getSimpleName().toString()))
                        .forEach(this::check);
            }
            return true;                     // claim the annotation: no other processor needs it
        }

        private void check(Element type) {
            List<String> fields = type.getEnclosedElements().stream()
                    .filter(m -> m.getKind() == ElementKind.FIELD)
                    .map(m -> m.getSimpleName() + ":" + m.asType())
                    .toList();
            boolean hasId = fields.stream().anyMatch(f -> f.startsWith("id:"));
            processingEnv.getMessager().printMessage(
                    hasId ? Diagnostic.Kind.NOTE : Diagnostic.Kind.ERROR,
                    "@Entity " + type.getSimpleName() + (hasId ? " ok, fields " + fields : " has no 'id' field"),
                    type);
        }
    }

    static JavaFileObject source(String className, String code) {
        URI uri = URI.create("string:///" + className.replace('.', '/') + ".java");
        return new SimpleJavaFileObject(uri, JavaFileObject.Kind.SOURCE) {
            @Override
            public CharSequence getCharContent(boolean ignoreEncodingErrors) {
                return code;
            }
        };
    }

    public static void main(String[] args) {
        List<JavaFileObject> sources = List.of(
                source("demo.Entity", "package demo; import java.lang.annotation.*;"
                        + " @Retention(RetentionPolicy.SOURCE) @Target(ElementType.TYPE) public @interface Entity { }"),
                source("demo.User", "package demo; @Entity public class User { long id; String name; }"),
                source("demo.Order", "package demo; @Entity public class Order { String reference; java.util.List<String> lines; }"),
                source("demo.Money", "package demo; public record Money(long cents) { }"));

        JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        // -proc:only: run the processors, skip code generation (we only want the checks)
        JavaCompiler.CompilationTask task = javac.getTask(null, null, diagnostics, List.of("-proc:only"), null, sources);
        task.setProcessors(List.of(new EntityChecker()));
        boolean ok = task.call();

        for (Diagnostic<? extends JavaFileObject> d : diagnostics.getDiagnostics()) {
            String file = d.getSource() == null ? "-" : d.getSource().getName();
            System.out.println(d.getKind() + " " + file + ":" + d.getLineNumber() + " " + d.getMessage(Locale.ROOT));
        }
        System.out.println("compilation succeeded: " + ok);
    }
}
```

## Output

```text title="Output" output="AnnotationsDemo.java"
valid form   -> []
invalid form -> [age: must be between 13 and 120, email: must match [^@]+@[^@]+\.[a-z]+, username: must not be blank]
missing email -> [age: must be between 13 and 120, email: email is required]
Tagged runtime annotations: [RuntimeVisible]
Customer @Audited via getAnnotation: true, declared on Customer itself: 0
getAnnotation(Role) = null, container present = true, getAnnotationsByType = [admin, auditor]
legacyExport deprecated since 2.0, forRemoval true
annotation object is a proxy: true, implements Range, equal by value: true
```

```text title="Output" output="EntityProcessorDemo.java"
round 1: annotations [demo.Entity]
round 2: annotations [] (final round)
ERROR /demo/Order.java:1 @Entity Order has no 'id' field
NOTE /demo/User.java:1 @Entity User ok, fields [id:long, name:java.lang.String]
compilation succeeded: false
```

- **Validator**: the annotations only carried rules. `validate` read them reflectively and enforced them; `referrer` had no annotation and was never checked. This is how Hibernate Validator (`@NotBlank`, `@Size`, `@Email`) works, with far more features.
- **Retention**: `Tagged` carries three annotations in the source, but reflection sees only `RuntimeVisible`. `SOURCE` was discarded, and `CLASS` (the default!) sits in the class file, invisible. Forgetting `@Retention(RUNTIME)` is the classic "my annotation is ignored" bug.
- **`@Inherited`**: `Customer` "has" `@Audited` through `BaseEntity`, while `getDeclaredAnnotations` shows nothing on `Customer` itself.
- **Repeatable**: `getAnnotation(Role.class)` is `null` because the repeats were stored in the `@Roles` container. `getAnnotationsByType` looks inside it.
- The annotation instance is a **proxy** implementing `Range`, equal to another instance with the same values.
- **Processor**: javac ran `EntityChecker` in round 1 with the `@Entity` elements, then a final round with no annotations. The `ERROR` diagnostic made the compilation **fail**, pointing at `Order.java:1` before any code ran. `Money` wasn't annotated, so the processor never saw it.

## Real-world application

- **Spring**: `@Component`/`@Service` (found by classpath scanning), `@Autowired`, `@Transactional` and `@Cacheable` (implemented with proxies), `@RequestMapping`/`@GetMapping`, `@ConfigurationProperties`. Spring also supports **meta-annotations**: `@RestController` is itself annotated with `@Controller` and `@ResponseBody`.
- **JPA/Hibernate**: `@Entity`, `@Id`, `@Column`, `@OneToMany` map classes to tables. The **JPA static metamodel** (`User_`) is generated by an annotation processor.
- **Compile-time code generation**:
  - Lombok (`@Getter`, `@Builder`): rewrites the AST;
  - MapStruct (mappers), Dagger (DI without reflection), AutoValue/Immutables (value types);
  - Micronaut and Quarkus (DI and AOP computed at build time for fast start-up and native images).
- **Testing**: JUnit 5 (`@Test`, `@ParameterizedTest`, `@BeforeEach`, `@ExtendWith`), Mockito (`@Mock`, `@InjectMocks`).
- **Static analysis**: `@Nullable`/`@NonNull` (JSpecify, Checker Framework), Error Prone's `@CanIgnoreReturnValue`, `@GuardedBy` (Concurrency stage).

## Common mistakes

- **Forgetting `@Retention(RUNTIME)`**: the default is `CLASS`, so reflection never sees the annotation.
- **Calling `getAnnotation` for a repeatable annotation** and getting `null`. Use `getAnnotationsByType`.
- **Expecting `@Inherited` to work for interfaces or methods**: it only applies to class annotations inherited from superclasses.
- **Giving an element a `null` default or a non-constant value**: it doesn't compile. Use a sentinel.
- **Assuming an annotation does something by itself**: `@Transactional` on a `private` method or a self-call does nothing, because the proxy never sees the call (next lesson).
- **Heavy runtime scanning** of large class paths on every start-up. Index at build time or use compile-time processing where start-up matters.
- **Mistaking annotation processors for bytecode rewriting**: a standard processor can only **create** new files; it can't edit the class being compiled.

## Interview questions

**Q1. What are the retention policies, and which is the default?**

````reveal title="Answer"
- `SOURCE`: discarded by the compiler (`@Override`, `@SuppressWarnings`).
- `CLASS`: kept in the class file but not loaded for reflection. This is **the default**, and it's used by bytecode tools.
- `RUNTIME`: available via reflection (`getAnnotation`).

Frameworks that read annotations at run time need `RUNTIME`; forgetting it makes the annotation silently invisible.
````

**Q2. How do annotation processors differ from runtime annotation handling?**

````reveal title="Answer"
Processors run **inside javac** on the source model (`javax.lang.model` elements) in rounds. They can report errors and warnings (failing the build) and generate new source and resource files, which are compiled in the next round. Runtime handling uses reflection on loaded classes and changes behaviour while the program runs. Processing at compile time has no run-time cost, catches errors early and works with native images (Dagger, MapStruct, Micronaut). Runtime processing is more dynamic (Spring, JPA) but costs start-up time.
````

**Q3. How do repeatable annotations work?**

````reveal title="Answer"
Mark the annotation `@Repeatable(Container.class)`, where the container has `Annotation[] value()`. When the annotation is used more than once, the compiler stores a single container annotation holding the array. Therefore:
- `getAnnotation(Role.class)` returns null for repeated uses;
- `getAnnotation(Roles.class)` returns the container;
- `getAnnotationsByType(Role.class)` returns all of them, looking through the container. A single use is stored directly.
````

**Q4. What can be the type of an annotation element, and why can't it be `null`?**

````reveal title="Answer"
Primitives, `String`, `Class<?>`, enums, annotations, and one-dimensional arrays of those. Values must be compile-time constants because they're stored in the class file's constant pool and attributes. The class-file format has no null encoding for element values, so the language forbids `null`. Use sentinels such as `""`, `void.class` or a `NONE` enum constant.
````

**Q5. How does Lombok generate getters if annotation processors can't modify classes?**

````reveal title="Answer"
It registers as an annotation processor, but instead of using only the public `Filer` API, it casts into javac's internal classes and **modifies the abstract syntax tree** of the class being compiled, adding methods before bytecode generation. That's outside the specification, so Lombok must track compiler internals with each JDK release and needs `--add-opens`-style access. Standard processors (MapStruct, AutoValue, Dagger) instead generate new classes (`User_`, `AutoValue_User`).
````

## Hands-on exercise

Build a **mini test runner** driven by annotations:
- `@Check` marks test methods (runtime retention, methods only), with an optional element `Class<? extends Throwable> expected() default None.class` (a sentinel, because `null` isn't allowed);
- `@Skip("reason")` skips a method;
- `run(Class<?> testClass)` creates one instance **per test method** (as JUnit does), invokes each `@Check` method in name order, and prints `PASS`, `FAIL (message)` or `SKIP (reason)`. A test with `expected` passes only if it throws that exception type;
- finally print a summary `3 passed, 1 failed, 1 skipped`.

````hint title="Hint"
`Method.invoke` wraps the test's exception in `InvocationTargetException`: compare `e.getCause()` with `check.expected().isInstance(cause)`. A test that expects an exception but completes normally fails with "expected X". Use `getDeclaredConstructor().newInstance()` per method.
````

````solution title="Solution"
```java title="MiniRunner.java" file="MiniRunner.java"
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class MiniRunner {
    static final class None extends Throwable {
        private static final long serialVersionUID = 1L;
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface Check {
        Class<? extends Throwable> expected() default None.class;
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface Skip {
        String value();
    }

    public static class CartTests {
        private final List<String> cart = new ArrayList<>();   // fresh per test

        @Check public void addsItem() {
            cart.add("book");
            if (cart.size() != 1) throw new AssertionError("size " + cart.size());
        }

        @Check public void startsEmpty() {
            if (!cart.isEmpty()) throw new AssertionError("cart not empty");
        }

        @Check(expected = IndexOutOfBoundsException.class) public void firstOfEmptyThrows() {
            cart.get(0);
        }

        @Check(expected = IllegalStateException.class) public void wrongExpectation() {
            cart.add("pen");                 // throws nothing: should FAIL
        }

        @Check @Skip("payment sandbox down") public void checkout() {
            throw new AssertionError("never runs");
        }

        public void helper() { }             // not a test
    }

    static void run(Class<?> testClass) throws ReflectiveOperationException {
        int passed = 0, failed = 0, skipped = 0;
        Method[] methods = testClass.getDeclaredMethods();
        Arrays.sort(methods, Comparator.comparing(Method::getName));
        for (Method m : methods) {
            Check check = m.getAnnotation(Check.class);
            if (check == null) {
                continue;
            }
            Skip skip = m.getAnnotation(Skip.class);
            if (skip != null) {
                System.out.println("SKIP " + m.getName() + " (" + skip.value() + ")");
                skipped++;
                continue;
            }
            Object instance = testClass.getDeclaredConstructor().newInstance();
            String failure = null;
            try {
                m.invoke(instance);
                if (check.expected() != None.class) {
                    failure = "expected " + check.expected().getSimpleName();
                }
            } catch (InvocationTargetException e) {
                Throwable cause = e.getCause();
                if (!check.expected().isInstance(cause)) {
                    failure = cause.getClass().getSimpleName() + ": " + cause.getMessage();
                }
            }
            if (failure == null) {
                System.out.println("PASS " + m.getName());
                passed++;
            } else {
                System.out.println("FAIL " + m.getName() + " (" + failure + ")");
                failed++;
            }
        }
        System.out.println(passed + " passed, " + failed + " failed, " + skipped + " skipped");
    }

    public static void main(String[] args) throws ReflectiveOperationException {
        run(CartTests.class);
    }
}
```

```text title="Output" output="MiniRunner.java"
PASS addsItem
SKIP checkout (payment sandbox down)
PASS firstOfEmptyThrows
PASS startsEmpty
FAIL wrongExpectation (expected IllegalStateException)
3 passed, 1 failed, 1 skipped
```

This is the skeleton of JUnit: annotation-driven discovery, a fresh instance per test, unwrapped `InvocationTargetException`s, and expected-exception matching (`assertThrows` in JUnit 5).
````

## Knowledge check

```quiz
? An annotation has no @Retention. Can reflection read it?
+ No, the default is CLASS, which isn't visible to reflection
- Yes, the default is RUNTIME
- Only with setAccessible(true)
> Add @Retention(RetentionPolicy.RUNTIME).

? A class has @Role("a") @Role("b") (a repeatable annotation). What does getAnnotation(Role.class) return?
+ null, because the repeats are stored in the container annotation
- The first @Role
- An array of both
> Use getAnnotationsByType(Role.class).

? What can a standard annotation processor do?
+ Report compile errors and generate new source files
- Modify the bytecode of the class being compiled
- Change behaviour at run time
> Lombok's AST editing is a non-standard hack.

? Which annotation is inherited by a subclass when the superclass has it?
+ A class annotation whose type is marked @Inherited
- Any RUNTIME annotation
- Method annotations marked @Inherited
> @Inherited works for superclass type annotations only.

? Which element default is illegal?
+ String name() default null;
- int[] codes() default {};
- Class<?> type() default void.class;
> Annotation elements can never be null.
```

## Key takeaways

- Annotations are **metadata**; something must read them: the compiler, an **annotation processor** at compile time, or a framework via **reflection** at run time.
- `@Retention`: `SOURCE`, `CLASS` (**default**, invisible to reflection), `RUNTIME`. `@Target` restricts placement; `@Inherited` covers superclass type annotations only; `@Repeatable` stores repeats in a container.
- Element types are restricted (primitives, `String`, `Class`, enums, annotations, arrays), constants only, **never null**.
- Runtime annotation objects are proxies; `getAnnotationsByType` handles repeatable annotations.
- Processors run in rounds inside javac, report errors via `Messager` and generate code via `Filer`. They power Lombok, MapStruct and Dagger, and are the start-up-friendly alternative to reflection.

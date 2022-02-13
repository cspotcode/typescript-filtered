// This error is excluded by our .gitattributes filters
const a: string = 123;
class Foo {
    foo() {
        const b: {a?: number} = {};
        const c = b.a;
        // This error will *not* be excluded
        console.log(c.toFixed());

    }
}

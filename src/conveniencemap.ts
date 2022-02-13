export abstract class ConvenienceMap<A, B> extends Map<A, B> {
    static create<A, B>(makeDefault: (key: A) => B) {
        return new (class extends ConvenienceMap<A, B> {
            _makeDefault(key: A): B {
                return makeDefault(key);
            }
        })();
    }
    abstract _makeDefault(key: A): B;
    getWithDefault(key: A): B {
        let value = this.get(key);
        if(!value) {
            value = this._makeDefault(key);
            this.set(key, value);
        }
        return value;
    }
}
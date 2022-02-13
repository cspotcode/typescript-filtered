/// <reference types="ts-expose-internals" />
import {Diagnostics} from 'typescript';
export const tsDiagnosticMessages = new Map<number, string>();

for(const [key, value] of Object.entries(Diagnostics)) {
    tsDiagnosticMessages.set(value.code, value.message);
}

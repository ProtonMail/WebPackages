import { RuleTester } from "@typescript-eslint/rule-tester";
import * as test from "node:test";
import rule from "../src/rules/enforce-uint8array-arraybuffer.ts";
import tsParser from "@typescript-eslint/parser"; // import parser

RuleTester.afterAll = test.after;
RuleTester.describe = test.describe;
RuleTester.it = test.it;
RuleTester.itOnly = test.it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
    },
  },
});

ruleTester.run("enforce-uint8array-arraybuffer", rule, {
  valid: [
    // Correct usage with generic
    `let a: Uint8Array<ArrayBuffer>;`,
    `type MyType = Uint8Array<ArrayBuffer>;`,
    `function foo(param: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> { return param; }`,
    `class C { prop: Uint8Array<ArrayBuffer>; }`,
    `type Nested = Readonly<Uint8Array<ArrayBuffer>>;`,
    `let a = new Uint8Array()`, // ok since type inference results in Uint8Array<ArrayBuffer>
    `let a = Uint8Array.from()`,
  ],
  invalid: [
    {
      code: `let a: Uint8Array;`,
      errors: [{ messageId: "missingGeneric" }],
      output: `let a: Uint8Array<ArrayBuffer>;`,
    },
    {
      code: `type T = Uint8Array;`,
      errors: [{ messageId: "missingGeneric" }],
      output: `type T = Uint8Array<ArrayBuffer>;`,
    },
    {
      code: "type U = Uint8Array | string;",
      errors: [{ messageId: "missingGeneric" }],
      output: "type U = Uint8Array<ArrayBuffer> | string;",
    },
    {
      code: "type A = Uint8Array[];",
      errors: [{ messageId: "missingGeneric" }],
      output: "type A = Uint8Array<ArrayBuffer>[];",
    },
    {
      code: `function f(): Uint8Array { return new Uint8Array(); }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `function f(): Uint8Array<ArrayBuffer> { return new Uint8Array(); }`,
    },
    {
      code: `function f(param: Uint8Array) {}`,
      errors: [{ messageId: "missingGeneric" }],
      output: `function f(param: Uint8Array<ArrayBuffer>) {}`,
    },
    {
      code: `function f<D extends string | Uint8Array>() {}`,
      errors: [{ messageId: "missingGeneric" }],
      output: `function f<D extends string | Uint8Array<ArrayBuffer>>() {}`,
    },
    {
      code: `function f(options: { data: Uint8Array; }) {};`,
      errors: [{ messageId: "missingGeneric" }],
      output: `function f(options: { data: Uint8Array<ArrayBuffer>; }) {};`,
    },
    {
      code: `function f(
                callback: () => Promise<{ contents: Promise<Uint8Array> }>
            ) {}`,
      errors: [{ messageId: "missingGeneric" }],
      output: `function f(
                callback: () => Promise<{ contents: Promise<Uint8Array<ArrayBuffer>> }>
            ) {}`,
    },
    {
      code: `export function f(options: { data: Uint8Array; }): void;`,
      errors: [{ messageId: "missingGeneric" }],
      output: `export function f(options: { data: Uint8Array<ArrayBuffer>; }): void;`,
    },
    {
      code: `export function f({ data }: { data: Uint8Array; }): void;`,
      errors: [{ messageId: "missingGeneric" }],
      output: `export function f({ data }: { data: Uint8Array<ArrayBuffer>; }): void;`,
    },
    {
      code: `class C { prop: Uint8Array; }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `class C { prop: Uint8Array<ArrayBuffer>; }`,
    },
    {
      code: `class C { method(options: { data: Uint8Array }) {} }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `class C { method(options: { data: Uint8Array<ArrayBuffer> }) {} }`,
    },
    {
      code: `const f = (param: Uint8Array = new Uint8Array()) => {}`,
      errors: [{ messageId: "missingGeneric" }],
      output: `const f = (param: Uint8Array<ArrayBuffer> = new Uint8Array()) => {}`,
    },
    {
      code: `f<Uint8Array>();`,
      errors: [{ messageId: "missingGeneric" }],
      output: `f<Uint8Array<ArrayBuffer>>();`,
    },
    {
      code: `f<{ data: Uint8Array; }>();`,
      errors: [{ messageId: "missingGeneric" }],
      output: `f<{ data: Uint8Array<ArrayBuffer>; }>();`,
    },
    {
      code: `const a = { f(): Uint8Array {} }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `const a = { f(): Uint8Array<ArrayBuffer> {} }`,
    },
    {
      code: `type MyTuple = [Uint8Array, number];`,
      errors: [{ messageId: "missingGeneric" }],
      output: `type MyTuple = [Uint8Array<ArrayBuffer>, number];`,
    },
    {
      code: `blob.stream() as ReadableStream<Uint8Array>`,
      errors: [{ messageId: "missingGeneric" }],
      output: `blob.stream() as ReadableStream<Uint8Array<ArrayBuffer>>`,
    },
    {
      code: `type T = Whatever & { start: () => ReadableStream<Uint8Array>; }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `type T = Whatever & { start: () => ReadableStream<Uint8Array<ArrayBuffer>>; }`,
    },
    {
      code: `interface A { data: Uint8Array }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `interface A { data: Uint8Array<ArrayBuffer> }`,
    },
    {
      code: `interface A extends B { data?: Uint8Array }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `interface A extends B { data?: Uint8Array<ArrayBuffer> }`,
    },
    {
      code: `interface A extends B { f(): Uint8Array }`,
      errors: [{ messageId: "missingGeneric" }],
      output: `interface A extends B { f(): Uint8Array<ArrayBuffer> }`,
    },
    {
      code: `let a: Uint8Array<any>;`,
      errors: [{ messageId: "wrongGeneric" }],
      // no output: manual fix/suppression required
    },
    {
      code: `type Nested = Readonly<Uint8Array<any>>;`,
      errors: [{ messageId: "wrongGeneric" }],
      // no output: manual fix/suppression required
    },
  ],
});

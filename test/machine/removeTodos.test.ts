import * as assert from "assert";
import { partialHtmlComment, dropLine } from "../../lib/machine/removeTodos";

describe("partial HTML comment", () => {
    it("Should not see a full comment as a partial comment", () => {
        assert(!partialHtmlComment("<!-- I am a whole comment -->"));
        assert(partialHtmlComment("<!-- it starts here"));
        assert(!partialHtmlComment("There is nothing to see here"));
        assert(partialHtmlComment("  it ends here --> and the markdown continues"));
    });
});

describe("dropping a line", () => {
    it("drops a line from the middle", () => {
        const input = `one
    two
    three`;
        const output = `one
    three`;
        assert.deepEqual(dropLine(2, input), output);
    });
});
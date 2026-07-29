# `ParagraphStyle`

Remote writable paragraph style.

Properties: `justification`, `justificationFeatures`, left/right/first-line indents, space before/after, kashida width, kinsoku, mojikumi, hyphenation and its features, layout mode, type-interface features.

All reads are async; writes queue. Methods: `reset`, `batchGet`, `batchSet`, `dispose`. `justificationFeatures` and `hyphenationFeatures` are plain value objects.

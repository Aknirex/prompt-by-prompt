---
name: New Prompt Template
about: Suggest a new prompt template to add to the library
title: '[Template] '
labels: template
assignees: ''
---

## Template Name
What should this template be called?

## Category
Which category does this template belong to?
- [ ] Code Analysis
- [ ] Code Generation
- [ ] Testing
- [ ] Documentation
- [ ] Data
- [ ] Development
- [ ] Other (please specify)

## Use Case
Describe the use case for this template. What problem does it solve?

## Suggested Template
Please provide a draft of the template:

```yaml
id: "pbp.category.name.001"
name: "Template Name"
description: "Description"
category: "Category"
tags: ["tag1", "tag2"]
version: "1.0.0"

variables:
  - name: "variable_name"
    description: "Variable description"
    type: "string"
    required: true

template: |
  Your prompt template here.
  Use {{variable_name}} for variables.
```

## Example Usage
Provide an example of how this template would be used:

**Input:**
```
Example code or input
```

**Expected Output:**
```
Expected LLM response
```

/**
 * MCP tool schema normalization.
 * Transforms complex JSON Schema (with $ref, allOf, anyOf, oneOf, if-then-else)
 * into a simple flat schema suitable for tool parameter definitions.
 *
 * Ported from original project's tool-schema.ts with `any` → `unknown` typing.
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cloneValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)])
    ) as T
  }
  return value
}

const deepMergeSchemas = (
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> => {
  const merged = { ...target }

  for (const [key, value] of Object.entries(source)) {
    const currentValue = merged[key]

    if (key === 'required' && Array.isArray(value)) {
      merged[key] = Array.from(
        new Set([...(Array.isArray(currentValue) ? currentValue : []), ...value])
      )
      continue
    }

    if (key === 'enum' && Array.isArray(value)) {
      merged[key] = Array.from(
        new Set([...(Array.isArray(currentValue) ? currentValue : []), ...value])
      )
      continue
    }

    if (
      key === 'properties' &&
      isPlainObject(currentValue) &&
      isPlainObject(value)
    ) {
      merged[key] = { ...currentValue }

      for (const [propertyKey, propertyValue] of Object.entries(value)) {
        if (
          isPlainObject(
            (merged[key] as Record<string, unknown>)[propertyKey]
          ) &&
          isPlainObject(propertyValue)
        ) {
          ;(merged[key] as Record<string, unknown>)[propertyKey] =
            deepMergeSchemas(
              (merged[key] as Record<string, unknown>)[propertyKey] as Record<
                string,
                unknown
              >,
              propertyValue
            )
        } else {
          ;(merged[key] as Record<string, unknown>)[propertyKey] = propertyValue
        }
      }
      continue
    }

    if (isPlainObject(currentValue) && isPlainObject(value)) {
      merged[key] = deepMergeSchemas(
        currentValue as Record<string, unknown>,
        value
      )
      continue
    }

    merged[key] = value
  }

  return merged
}

const resolveSchemaRefs = (
  schema: unknown,
  definitions: Record<string, unknown>,
  visitedRefs = new Set<string>()
): unknown => {
  if (!isPlainObject(schema) && !Array.isArray(schema)) {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map((item) => resolveSchemaRefs(item, definitions, visitedRefs))
  }

  const ref = schema.$ref
  if (typeof ref === 'string') {
    const defsMatch = ref.match(/^#\/\$defs\/(.+)$/)
    const definitionsMatch = ref.match(/^#\/definitions\/(.+)$/)
    const match = defsMatch || definitionsMatch

    if (match) {
      const definition = definitions[match[1]]

      if (definition && !visitedRefs.has(ref)) {
        const nextVisitedRefs = new Set(visitedRefs)
        nextVisitedRefs.add(ref)

        const { $ref: _ref, ...rest } = schema
        return deepMergeSchemas(
          (resolveSchemaRefs(definition, definitions, nextVisitedRefs) ??
            {}) as Record<string, unknown>,
          Object.fromEntries(
            Object.entries(rest).map(([key, value]) => [
              key,
              resolveSchemaRefs(value, definitions, nextVisitedRefs),
            ])
          )
        )
      }
    }
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      resolveSchemaRefs(value, definitions, visitedRefs),
    ])
  )
}

const simplifyUnionSchemas = (
  schemas: Record<string, unknown>[]
): Record<string, unknown> | undefined => {
  const objectSchemas = schemas.filter(
    (schema) =>
      isPlainObject(schema) &&
      (schema.type === 'object' || isPlainObject(schema.properties))
  )

  if (objectSchemas.length === 0) {
    return undefined
  }

  const merged = objectSchemas.reduce<Record<string, unknown>>(
    (accumulator, schema) => deepMergeSchemas(accumulator, schema),
    {}
  )

  const requiredLists = objectSchemas
    .map((schema) => schema.required)
    .filter(Array.isArray) as string[][]

  if (requiredLists.length > 1) {
    const [first, ...rest] = requiredLists
    merged.required = first.filter((key) =>
      rest.every((required) => required.includes(key))
    )
  }

  return merged
}

const simplifySchema = (schema: unknown): unknown => {
  if (!isPlainObject(schema) && !Array.isArray(schema)) {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map((item) => simplifySchema(item))
  }

  let nextSchema = { ...schema }

  const conditionalBranches = [schema.then, schema.else].filter(isPlainObject)
  for (const branch of conditionalBranches) {
    nextSchema = deepMergeSchemas(
      nextSchema,
      branch as Record<string, unknown>
    )
  }

  if (Array.isArray(schema.allOf)) {
    nextSchema = schema.allOf.reduce<Record<string, unknown>>(
      (accumulator, childSchema) =>
        deepMergeSchemas(
          accumulator,
          (simplifySchema(childSchema) ?? {}) as Record<string, unknown>
        ),
      nextSchema
    )
  }

  const unionSchemas = ([schema.anyOf, schema.oneOf] as unknown[][]).find(
    Array.isArray
  )

  if (unionSchemas?.length) {
    const mergedUnionSchema = simplifyUnionSchemas(
      unionSchemas
        .map((item) => simplifySchema(item))
        .filter(isPlainObject) as Record<string, unknown>[]
    )

    if (mergedUnionSchema) {
      nextSchema = deepMergeSchemas(nextSchema, mergedUnionSchema)
    }
  }

  delete nextSchema.$schema
  delete nextSchema.$id
  delete nextSchema.$defs
  delete nextSchema.definitions
  delete nextSchema.$ref
  delete nextSchema.allOf
  delete nextSchema.anyOf
  delete nextSchema.oneOf
  delete nextSchema.not
  delete nextSchema.if
  delete nextSchema.then
  delete nextSchema.else
  delete nextSchema.unevaluatedProperties

  if (isPlainObject(nextSchema.properties)) {
    nextSchema.properties = Object.fromEntries(
      Object.entries(nextSchema.properties).map(([key, value]) => [
        key,
        simplifySchema(value),
      ])
    )
  }

  if (Array.isArray(nextSchema.items)) {
    nextSchema.items = nextSchema.items.map((item: unknown) =>
      simplifySchema(item)
    )
  } else if (isPlainObject(nextSchema.items)) {
    nextSchema.items = simplifySchema(nextSchema.items)
  }

  if (isPlainObject(nextSchema.additionalProperties)) {
    nextSchema.additionalProperties = simplifySchema(
      nextSchema.additionalProperties
    )
  }

  if (isPlainObject(nextSchema.properties) && !nextSchema.type) {
    nextSchema.type = 'object'
  }

  if (nextSchema.type === 'object' && !isPlainObject(nextSchema.properties)) {
    nextSchema.properties = {}
  }

  return nextSchema
}

/**
 * Normalize an MCP tool schema into a simple JSON Schema.
 * Resolves $ref, flattens allOf/anyOf/oneOf, removes conditional schemas.
 */
export const normalizeMcpToolSchema = (
  schema: unknown
): Record<string, unknown> => {
  const normalizedInput = isPlainObject(schema)
    ? cloneValue(schema)
    : { type: 'object', properties: {} }

  const definitions = {
    ...(isPlainObject(normalizedInput.$defs) ? normalizedInput.$defs : {}),
    ...(isPlainObject(normalizedInput.definitions)
      ? normalizedInput.definitions
      : {}),
  }

  const resolvedSchema = resolveSchemaRefs(normalizedInput, definitions)
  const simplifiedSchema = simplifySchema(resolvedSchema)

  if (!isPlainObject(simplifiedSchema)) {
    return {
      type: 'object',
      properties: {},
    }
  }

  if (
    simplifiedSchema.type === 'object' &&
    !isPlainObject(simplifiedSchema.properties)
  ) {
    ;(simplifiedSchema as Record<string, unknown>).properties = {}
  }

  return simplifiedSchema as Record<string, unknown>
}

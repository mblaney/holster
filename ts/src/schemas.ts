import { z } from "zod"

// ============================================================================
// Core Primitive Types
// ============================================================================

/**
 * Soul identifier - unique identifier for graph nodes
 * Examples: "root", "~pubkey", "~@username", random UUIDs
 */
export const SoulSchema = z.string().min(1)
export type Soul = z.infer<typeof SoulSchema>

/**
 * Timestamp for state vector (HAM conflict resolution)
 */
export const TimestampSchema = z.number().int().nonnegative()
export type Timestamp = z.infer<typeof TimestampSchema>

/**
 * Base64 encoded string (for signatures, encrypted data, etc)
 */
export const Base64Schema = z.string()
export type Base64String = z.infer<typeof Base64Schema>

// ============================================================================
// Graph Data Structures
// ============================================================================

/**
 * Relation - reference to another node in the graph
 * Format: {"#": "soul-id"}
 */
export const RelationSchema = z.object({
  "#": SoulSchema,
})
export type Relation = z.infer<typeof RelationSchema>

/**
 * Valid graph values - primitives, null, relations, or nested objects
 * Note: GraphValue is recursive to allow nested objects (verified in src/holster.js check() function)
 */
export const GraphValueSchema: z.ZodType<GraphValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    RelationSchema,
    z.record(z.string(), GraphValueSchema),
  ])
)

export type GraphValue =
  | string
  | number
  | boolean
  | null
  | Relation
  | { [key: string]: GraphValue }

/**
 * State vector - tracks timestamps for each property
 */
export const StateVectorSchema = z.record(z.string(), TimestampSchema)
export type StateVector = z.infer<typeof StateVectorSchema>

/**
 * Signature map - maps timestamps or property names to signatures
 */
export const SignatureMapSchema = z.record(z.string(), Base64Schema)
export type SignatureMap = z.infer<typeof SignatureMapSchema>

/**
 * Graph metadata attached to each node
 */
export const GraphMetadataSchema = z.object({
  "#": SoulSchema,
  ">": StateVectorSchema,
  s: SignatureMapSchema.optional(),
})
export type GraphMetadata = z.infer<typeof GraphMetadataSchema>

/**
 * User metadata keys
 */
export const USER_PUBLIC_KEY = "_holster_user_public_key"
export const USER_SIGNATURE = "_holster_user_signature"

/**
 * Graph node - contains metadata and properties
 * Note: Using manual type to properly handle the index signature with special _ key
 */
export const GraphNodeSchema = z.object({
  _: GraphMetadataSchema,
}).and(z.record(z.string(), GraphValueSchema))

export type GraphNode = {
  _: GraphMetadata
  [key: string]: GraphValue | GraphMetadata
}

/**
 * Graph - collection of nodes indexed by soul
 */
export const GraphSchema = z.record(SoulSchema, GraphNodeSchema)
export type Graph = z.infer<typeof GraphSchema>

// ============================================================================
// Query/Lex Structures
// ============================================================================

/**
 * Prefix filter for lex queries
 */
export const PrefixFilterSchema = z.object({
  "*": z.string(),
})
export type PrefixFilter = z.infer<typeof PrefixFilterSchema>

/**
 * Range filter for lex queries
 */
export const RangeFilterSchema = z.object({
  ">": z.string().optional(),
  "<": z.string().optional(),
})
export type RangeFilter = z.infer<typeof RangeFilterSchema>

/**
 * Lex filter - supports various query patterns
 */
export const LexFilterSchema = z.union([
  z.string(),
  z.array(z.string()),
  PrefixFilterSchema,
  RangeFilterSchema,
  z.null(),
  z.undefined(),
])
export type LexFilter = z.infer<typeof LexFilterSchema>

// LexFilter with optional "." property for nested queries
export type LexWithDot =
  | LexFilter
  | { ".": LexFilter }

/**
 * Lex query object
 */
export const LexSchema = z.object({
  "#": SoulSchema,
  ".": LexFilterSchema.optional(),
})
export type Lex = z.infer<typeof LexSchema>

// ============================================================================
// Wire Protocol Messages
// ============================================================================

/**
 * Wire message ID (for deduplication)
 */
export const MessageIdSchema = z.string()
export type MessageId = z.infer<typeof MessageIdSchema>

/**
 * Wire message - protocol for network communication
 */
export const WireMessageSchema = z.object({
  "#": MessageIdSchema.optional(),
  "@": MessageIdSchema.optional(),
  get: LexSchema.optional(),
  put: GraphSchema.optional(),
  err: z.string().optional(),
  throttle: z.number().optional(),
})
export type WireMessage = z.infer<typeof WireMessageSchema>

/**
 * Wire options for get/put operations
 */
export const WireOptionsSchema = z
  .object({
    secure: z.boolean().optional(),
    fast: z.boolean().optional(),
    wait: z.number().optional(),
  })
  .optional()
export type WireOptions = z.infer<typeof WireOptionsSchema>

// ============================================================================
// Crypto/Security Structures
// ============================================================================

/**
 * ECDSA + ECDH key pair for user
 */
export const UserPairSchema = z.object({
  pub: z.string(), // Public key for signing (ECDSA)
  priv: z.string(), // Private key for signing (ECDSA)
  epub: z.string(), // Public key for encryption (ECDH)
  epriv: z.string(), // Private key for encryption (ECDH)
})
export type UserPair = z.infer<typeof UserPairSchema>

/**
 * User identity (authenticated user state)
 */
export const UserIdentitySchema = z.object({
  username: z.string(),
  pub: z.string(),
  epub: z.string(),
  priv: z.string(),
  epriv: z.string(),
})
export type UserIdentity = z.infer<typeof UserIdentitySchema>

/**
 * Encrypted data structure
 */
export const EncryptedDataSchema = z.object({
  ct: Base64Schema, // Ciphertext
  iv: Base64Schema, // Initialization vector
  s: Base64Schema, // Salt
})
export type EncryptedData = z.infer<typeof EncryptedDataSchema>

/**
 * Signed data structure
 */
export const SignedDataSchema = z.object({
  m: z.union([z.string(), z.record(z.string(), z.unknown())]), // Message
  s: Base64Schema, // Signature
})
export type SignedData = z.infer<typeof SignedDataSchema>

/**
 * User authentication data
 */
export const UserAuthSchema = z.object({
  enc: EncryptedDataSchema,
  salt: z.string(),
})
export type UserAuth = z.infer<typeof UserAuthSchema>

/**
 * JWK (JSON Web Key) format
 */
export const JWKSchema = z.object({
  kty: z.string(),
  crv: z.string().optional(),
  x: z.string().optional(),
  y: z.string().optional(),
  d: z.string().optional(),
  k: z.string().optional(),
  ext: z.boolean(),
  key_ops: z.array(z.string()).optional(),
  alg: z.string().optional(),
})
export type JWK = z.infer<typeof JWKSchema>

// ============================================================================
// Storage Structures
// ============================================================================

/**
 * Encoded value for storage: [value, timestamp] or [value, timestamp, signature]
 */
export const EncodedValueSchema = z.union([
  z.tuple([GraphValueSchema, TimestampSchema]),
  z.tuple([GraphValueSchema, TimestampSchema, Base64Schema]),
])

// Manual type definition for better tuple handling
export type EncodedValue =
  | [GraphValue, Timestamp]
  | [GraphValue, Timestamp, Base64String]

/**
 * Store interface callbacks
 */
export const StoreCallbackSchema = z.function()

/**
 * File system interface for storage
 */
export const FileSystemInterfaceSchema = z.object({
  get: z.function(),
  put: z.function(),
  list: z.function(),
})

// FileSystemInterface: Flexible to support both string-based and EncodedValue storage
// In-memory stores use strings, disk stores use EncodedValue/RadixNode
export interface FileSystemInterface {
  get: (file: string, cb: (err?: string | null, data?: string | EncodedValue | Record<string, unknown>) => void) => void
  put: (file: string, data: string | EncodedValue | Record<string, unknown>, cb: (err?: string | null) => void) => void
  list: (cb: (file?: string) => void) => void
}

/**
 * Store options
 */
export const StoreOptionsSchema = z.object({
  file: z.string().optional(),
  store: FileSystemInterfaceSchema.optional(),
  indexedDB: z.boolean().optional(),
  secure: z.boolean().optional(),
})
export type StoreOptions = z.infer<typeof StoreOptionsSchema>

/**
 * Radisk options
 */
export const RadiskOptionsSchema = z.object({
  log: z.function().optional(),
  batch: z.number().optional(),
  write: z.number().optional(),
  size: z.number().optional(),
  memoryLimit: z.number().optional(),
  readTimeout: z.number().optional(),
  cache: z.boolean().optional(),
  store: FileSystemInterfaceSchema.optional(),
})

export interface RadiskOptions {
  log?: (...args: unknown[]) => void
  batch?: number
  write?: number
  size?: number
  memoryLimit?: number
  readTimeout?: number
  cache?: boolean
  store?: FileSystemInterface
}

// ============================================================================
// HAM (Conflict Resolution) Structures
// ============================================================================

/**
 * HAM comparison result
 */
export const HamResultSchema = z.object({
  incoming: z.boolean().optional(),
  current: z.boolean().optional(),
  historical: z.boolean().optional(),
  state: z.boolean().optional(),
})
export type HamResult = z.infer<typeof HamResultSchema>

/**
 * HAM mix result - result of merging changes into graph
 */
export const HamMixResultSchema = z.object({
  now: GraphSchema,
  defer: GraphSchema,
  wait: z.number(),
  listeners: z.array(z.function()),
})
export type HamMixResult = z.infer<typeof HamMixResultSchema>

/**
 * Listen callback map for event listeners
 */
export const ListenerSchema = z.object({
  ".": LexFilterSchema.optional(),
  cb: z.function(),
})
export type Listener = z.infer<typeof ListenerSchema>

export const ListenMapSchema = z.record(SoulSchema, z.array(ListenerSchema))
export type ListenMap = z.infer<typeof ListenMapSchema>

// ============================================================================
// Holster API Structures
// ============================================================================

/**
 * Context chain for chained API calls
 */
export const ChainItemSchema = z.object({
  item: z.string().nullable(),
  soul: z.string().nullable(),
})
export type ChainItem = z.infer<typeof ChainItemSchema>

export const ApiContextSchema = z.object({
  chain: z.array(ChainItemSchema),
  cb: z.function().optional(),
  on: z.boolean().optional(),
  user: UserIdentitySchema.nullable().optional(),
})
export type ApiContext = z.infer<typeof ApiContextSchema>

/**
 * Holster options
 */
export const HolsterOptionsSchema = z
  .object({
    peers: z.union([z.string(), z.array(z.string())]).optional(),
    secure: z.boolean().optional(),
    port: z.number().optional(),
    server: z.any().optional(),
    wss: z.any().optional(),
    maxAge: z.number().optional(),
    maxConnections: z.number().optional(),
    maxMessageSize: z.number().optional(),
    maxQueueLength: z.number().optional(),
    wait: z.number().optional(),
  })
  .passthrough()
export type HolsterOptions = z.infer<typeof HolsterOptionsSchema>

// ============================================================================
// Utility Type Guards
// ============================================================================

/**
 * Check if value is a relation
 */
export function isRelation(value: unknown): value is Relation {
  return RelationSchema.safeParse(value).success
}

/**
 * Check if value is a valid graph value
 */
export function isGraphValue(value: unknown): value is GraphValue {
  return GraphValueSchema.safeParse(value).success
}

/**
 * Check if object is a valid graph node
 */
export function isGraphNode(value: unknown): value is GraphNode {
  return GraphNodeSchema.safeParse(value).success
}

/**
 * Check if object is a valid lex query
 */
export function isLex(value: unknown): value is Lex {
  return LexSchema.safeParse(value).success
}

// ============================================================================
// Radix Tree Structures
// ============================================================================

/**
 * Radix tree node (recursive structure)
 */
export type RadixNode = {
  [key: string]: RadixValue | undefined
}

// RadixValue can be GraphValue (raw), EncodedValue (tuple), or RadixNode (nested tree)
// This matches src/radix.js behavior - radix stores ANY value type
export type RadixValue = GraphValue | EncodedValue | RadixNode

/**
 * Radix function type - Single Source of Truth for Radix tree operations
 * Supports both synchronous get/put and async callback forms
 */
export type RadixFunction = {
  // Main call signature: synchronous get/put operations
  (keys?: string, value?: GraphValue | EncodedValue, tree?: RadixNode): 
    RadixNode | EncodedValue | undefined | Record<string, EncodedValue>
  
  // Callback form: async operations
  (key?: string, value?: RadixValue, cb?: (err?: string) => void): void
  
  // Static map method for iterating over radix tree values
  map: (
    radix: RadixFunction | RadixNode, 
    cb: (value: EncodedValue, fullKey: string, key: string, pre: string[]) => unknown,
    opt?: boolean,
    pre?: string[]
  ) => unknown
  
  // Dynamic properties for internal state (e.g., group separator key)
  [key: string]: unknown
}

// ============================================================================
// Dup (Duplicate Tracking) Structures
// ============================================================================

/**
 * Dup store for tracking message IDs
 */
export const DupStoreSchema = z.record(z.string(), z.number())
export type DupStore = z.infer<typeof DupStoreSchema>

export const DupSchema = z.object({
  store: DupStoreSchema,
  check: z.function(),
  track: z.function(),
  expiry: z.any().optional(),
})
export type Dup = z.infer<typeof DupSchema> & {
  check: (id: string) => string | false
  track: (id: string) => string
}

// ============================================================================
// Re-exports from modules
// ============================================================================

// Export RadiskInterface from radisk module for test usage
export type { RadiskInterface } from "./radisk.js"

// Export other interfaces for test usage
export type { WireAPI as WireInterface } from "./wire.js"
export type { UserInterface } from "./user.js"
export type { StoreInterface } from "./store.js"


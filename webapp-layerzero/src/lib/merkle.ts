import { ethers } from 'ethers'
import { buildPoseidon } from 'circomlibjs'

// Poseidon hash instance (initialized lazily)
let poseidonInstance: any = null
let poseidonHashFn: ((inputs: bigint[]) => bigint) | null = null

async function initPoseidon(): Promise<(inputs: bigint[]) => bigint> {
  if (poseidonHashFn) return poseidonHashFn

  poseidonInstance = await buildPoseidon()
  poseidonHashFn = (inputs: bigint[]): bigint => {
    const hash = poseidonInstance(inputs.map((x: bigint) => x.toString()))
    return BigInt(poseidonInstance.F.toString(hash))
  }

  return poseidonHashFn
}

// Synchronous poseidon hash (must call initPoseidon first)
function poseidonHash(inputs: bigint[]): bigint {
  if (!poseidonHashFn) {
    throw new Error('Poseidon not initialized. Call initPoseidon() first.')
  }
  return poseidonHashFn(inputs)
}

export { initPoseidon }

export interface MerkleProof {
  root: bigint
  pathElements: bigint[]
  pathIndices: number[]
}

export class MerkleTree {
  private depth: number
  private leaves: bigint[]
  private zeros: bigint[]
  private filledSubtrees: Map<number, bigint>

  constructor(depth: number) {
    this.depth = depth
    this.leaves = []
    this.zeros = []
    this.filledSubtrees = new Map()
    this.initZeros()
  }

  private initZeros() {
    let currentZero = BigInt(0)
    this.zeros.push(currentZero)
    for (let i = 1; i <= this.depth; i++) {
      currentZero = poseidonHash([currentZero, currentZero])
      this.zeros.push(currentZero)
    }
    for (let i = 0; i < this.depth; i++) {
      this.filledSubtrees.set(i, this.zeros[i])
    }
  }

  insert(commitment: bigint): number {
    const leafIndex = this.leaves.length
    this.leaves.push(commitment)

    let currentHash = commitment
    let currentIndex = leafIndex

    for (let level = 0; level < this.depth; level++) {
      if (currentIndex % 2 === 0) {
        this.filledSubtrees.set(level, currentHash)
        currentHash = poseidonHash([currentHash, this.zeros[level]])
      } else {
        const left = this.filledSubtrees.get(level) || this.zeros[level]
        currentHash = poseidonHash([left, currentHash])
      }
      currentIndex = Math.floor(currentIndex / 2)
    }

    return leafIndex
  }

  getRoot(): bigint {
    if (this.leaves.length === 0) {
      return this.zeros[this.depth]
    }
    let currentHash = this.leaves[this.leaves.length - 1]
    let currentIndex = this.leaves.length - 1
    for (let level = 0; level < this.depth; level++) {
      if (currentIndex % 2 === 0) {
        currentHash = poseidonHash([currentHash, this.zeros[level]])
      } else {
        const left = this.filledSubtrees.get(level) || this.zeros[level]
        currentHash = poseidonHash([left, currentHash])
      }
      currentIndex = Math.floor(currentIndex / 2)
    }
    return currentHash
  }

  getProof(leafIndex: number): MerkleProof {
    if (leafIndex >= this.leaves.length) {
      throw new Error('Leaf index out of bounds')
    }

    const pathElements: bigint[] = []
    const pathIndices: number[] = []

    let currentIndex = leafIndex
    for (let level = 0; level < this.depth; level++) {
      const isLeft = currentIndex % 2 === 0
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1

      let sibling: bigint
      // At level 0, check if sibling leaf exists
      if (level === 0) {
        sibling = siblingIndex < this.leaves.length ? this.leaves[siblingIndex] : this.zeros[0]
      } else {
        // For higher levels, compute the sibling node
        sibling = this.computeNodeAt(siblingIndex, level)
      }

      pathElements.push(sibling)
      pathIndices.push(isLeft ? 0 : 1)  // 0 = current is on left, 1 = current is on right
      currentIndex = Math.floor(currentIndex / 2)
    }

    return {
      root: this.getRoot(),
      pathElements,
      pathIndices,
    }
  }

  // Compute node hash at a given level and index
  private computeNodeAt(index: number, level: number): bigint {
    if (level === 0) {
      return index < this.leaves.length ? this.leaves[index] : this.zeros[0]
    }

    const leftChildIdx = index * 2
    const rightChildIdx = leftChildIdx + 1

    const left = this.computeNodeAt(leftChildIdx, level - 1)
    const right = this.computeNodeAt(rightChildIdx, level - 1)

    return poseidonHash([left, right])
  }

}

// Contract ABI for all events that add commitments to the PrivateLZBridge tree
const CONTRACT_EVENTS_ABI = [
  'event Deposited(address indexed user, uint256 amount, bytes32 indexed commitment, uint256 leafIndex)',
  'event CrossChainTransferInitiated(uint32 indexed dstEid, bytes32 indexed recipientCommitment, uint256 amount, bytes32 nullifier, bytes32 newSenderCommitment, uint256 senderLeafIndex, bytes32 guid)',
  'event CrossChainTransferReceived(uint32 indexed srcEid, bytes32 indexed commitment, uint256 amount, uint256 leafIndex)',
  'event Withdrawn(address indexed recipient, uint256 amount, bytes32 indexed nullifier, bytes32 newCommitment, uint256 newLeafIndex)',
]

interface CommitmentEvent {
  commitment: bigint
  leafIndex: number
  blockNumber: number
  logIndex: number
  type: 'deposit' | 'cross_chain_send' | 'cross_chain_receive' | 'withdraw'
}

/**
 * Build merkle tree from contract events
 * Queries both Deposited and PrivateTransfer events
 */
export async function buildMerkleTreeFromEvents(
  contractAddress: string,
  provider: ethers.Provider,
  options?: { deployBlock?: number, rpcUrl?: string }
): Promise<MerkleTree> {
  console.log('[Merkle] Starting tree build...')

  // Initialize Poseidon first
  await initPoseidon()

  const tree = new MerkleTree(10)

  // Use direct RPC to avoid MetaMask rate limiting
  const rpcUrl = options?.rpcUrl || 'https://base-sepolia-rpc.publicnode.com'
  const rpcProvider = new ethers.JsonRpcProvider(rpcUrl)
  const contract = new ethers.Contract(contractAddress, CONTRACT_EVENTS_ABI, rpcProvider)

  // Get current block number
  console.log('[Merkle] Getting current block...')
  const currentBlock = await rpcProvider.getBlockNumber()
  console.log('[Merkle] Current block:', currentBlock)

  // Scan from contract deploy block to catch all events
  const CONTRACT_DEPLOY_BLOCK = options?.deployBlock ?? Math.max(0, currentBlock - 50000)
  const CHUNK_SIZE = 10000

  // Collect all commitment events
  const commitmentEvents: CommitmentEvent[] = []

  console.log(`[Merkle] Querying from block ${CONTRACT_DEPLOY_BLOCK} to ${currentBlock} in chunks of ${CHUNK_SIZE}`)

  // Query in chunks to avoid RPC limits
  for (let fromBlock = CONTRACT_DEPLOY_BLOCK; fromBlock <= currentBlock; fromBlock += CHUNK_SIZE) {
    const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, currentBlock)

    try {
      // Query Deposited events - deposit() adds commitment to tree
      const depositFilter = contract.filters.Deposited()
      const depositEvents = await contract.queryFilter(depositFilter, fromBlock, toBlock)

      for (const event of depositEvents) {
        const e = event as ethers.EventLog
        if (e.args?.commitment) {
          commitmentEvents.push({
            commitment: BigInt(e.args.commitment),
            leafIndex: Number(e.args.leafIndex),
            blockNumber: e.blockNumber,
            logIndex: e.index,
            type: 'deposit',
          })
        }
      }

      // Query CrossChainTransferInitiated events - initiateTransfer() adds newSenderCommitment to tree
      const cctSendFilter = contract.filters.CrossChainTransferInitiated()
      const cctSendEvents = await contract.queryFilter(cctSendFilter, fromBlock, toBlock)

      for (const event of cctSendEvents) {
        const e = event as ethers.EventLog
        if (e.args?.newSenderCommitment) {
          commitmentEvents.push({
            commitment: BigInt(e.args.newSenderCommitment),
            leafIndex: Number(e.args.senderLeafIndex),
            blockNumber: e.blockNumber,
            logIndex: e.index,
            type: 'cross_chain_send',
          })
        }
      }

      // Query CrossChainTransferReceived events - lzReceive() adds commitment to tree
      const cctRecvFilter = contract.filters.CrossChainTransferReceived()
      const cctRecvEvents = await contract.queryFilter(cctRecvFilter, fromBlock, toBlock)

      for (const event of cctRecvEvents) {
        const e = event as ethers.EventLog
        if (e.args?.commitment) {
          commitmentEvents.push({
            commitment: BigInt(e.args.commitment),
            leafIndex: Number(e.args.leafIndex),
            blockNumber: e.blockNumber,
            logIndex: e.index,
            type: 'cross_chain_receive',
          })
        }
      }

      // Query Withdrawn events - withdraw() may insert a change commitment
      const withdrawFilter = contract.filters.Withdrawn()
      const withdrawEvents = await contract.queryFilter(withdrawFilter, fromBlock, toBlock)

      for (const event of withdrawEvents) {
        const e = event as ethers.EventLog
        if (e.args?.newCommitment && e.args.newCommitment !== ethers.ZeroHash) {
          commitmentEvents.push({
            commitment: BigInt(e.args.newCommitment),
            leafIndex: Number(e.args.newLeafIndex),
            blockNumber: e.blockNumber,
            logIndex: e.index,
            type: 'withdraw_change',
          })
        }
      }

      // Log progress every 10 chunks
      if ((fromBlock - CONTRACT_DEPLOY_BLOCK) % (CHUNK_SIZE * 10) === 0) {
        console.log(`[Merkle] Progress: block ${fromBlock}, found ${commitmentEvents.length} events so far`)
      }
    } catch (err) {
      console.warn(`[Merkle] Chunk ${fromBlock}-${toBlock} failed, skipping...`)
    }
  }

  console.log(`[Merkle] Total events found: ${commitmentEvents.length}`)

  // Sort by block number and log index to get correct insertion order
  commitmentEvents.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) {
      return a.blockNumber - b.blockNumber
    }
    return a.logIndex - b.logIndex
  })

  // All PrivateLZBridge events have explicit leafIndex, verify ordering
  for (let i = 0; i < commitmentEvents.length; i++) {
    const event = commitmentEvents[i]
    if (i > 0 && event.leafIndex <= commitmentEvents[i - 1].leafIndex) {
      console.warn(`[Merkle] LeafIndex ordering issue at position ${i}: ${event.leafIndex}`)
    }
  }

  // Log any gaps in leaf indices
  if (commitmentEvents.length > 0) {
    const firstIdx = commitmentEvents[0].leafIndex
    const lastIdx = commitmentEvents[commitmentEvents.length - 1].leafIndex
    const expectedCount = lastIdx - firstIdx + 1
    if (firstIdx !== 0) {
      console.warn(`[Merkle] Missing events for leaf indices 0-${firstIdx - 1}`)
    }
    if (commitmentEvents.length !== expectedCount) {
      console.warn(`[Merkle] Gap detected: have ${commitmentEvents.length} events for range ${firstIdx}-${lastIdx}`)
    }
  }

  console.log(`[Merkle] Inserting ${commitmentEvents.length} commitments into tree`)

  for (const event of commitmentEvents) {
    tree.insert(event.commitment)
  }

  console.log('[Merkle] Tree build complete, root:', '0x' + tree.getRoot().toString(16).padStart(64, '0'))
  return tree
}

/**
 * Get merkle proof for a specific leaf index
 */
export async function getMerkleProof(
  leafIndex: number,
  contractAddress: string,
  provider: ethers.Provider,
  options?: { deployBlock?: number, rpcUrl?: string }
): Promise<MerkleProof> {
  const tree = await buildMerkleTreeFromEvents(contractAddress, provider, options)
  return tree.getProof(leafIndex)
}

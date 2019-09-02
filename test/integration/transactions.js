const { describe, it } = require('mocha')
const assert = require('assert')
const bitcoin = require('../../')
const regtestUtils = require('./_regtest')
const regtest = regtestUtils.network
console.warn = () => {} // Silence the Deprecation Warning

function rng () {
  return Buffer.from('YT8dAtK4d16A3P1z+TpwB2jJ4aFH3g9M1EioIBkLEV4=', 'base64')
}

const ecc = require('tiny-secp256k1');
const wif = require('wif');
const NETWORKS = bitcoin.networks;

class AsyncSigner {
  constructor(
    __D,
    options,
  ) {
    this.lowR = false;
    if (options === undefined) options = {};
    this.compressed =
      options.compressed === undefined ? true : options.compressed;
    this.network = options.network || NETWORKS.bitcoin;

    // asign the private key
    this.__D = __D;
  }

  get privateKey() {
    return this.__D;
  }

  get publicKey() {
    if (!this.__Q) {
      this.__Q = ecc.pointFromScalar(this.__D, this.compressed);
    }
    return this.__Q;
  }

  toWIF() {
    if (!this.__D) throw new Error('Missing private key');
    return wif.encode(this.network.wif, this.__D, this.compressed);
  }

  async sign(hash, lowR) {
    if (!this.__D) throw new Error('Missing private key');
    if (lowR === undefined) lowR = this.lowR;
    if (lowR === false) {
      return ecc.sign(hash, this.__D);
    } else {
      let sig = ecc.sign(hash, this.__D);
      const extraData = Buffer.alloc(32, 0);
      let counter = 0;
      // if first try is lowR, skip the loop
      // for second try and on, add extra entropy counting up
      while (sig[0] > 0x7f) {
        counter++;
        extraData.writeUIntLE(counter, 0, 6);
        sig = ecc.signWithEntropy(hash, this.__D, extraData);
      }
      return sig;
    }
  }

  verify(hash, signature) {
    return ecc.verify(hash, this.publicKey, signature);
  }

  dump() {
    console.log('publicKey', this.publicKey);
    console.log('privateKey', this.privateKey);
  }
}

describe('bitcoinjs-lib (transactions)', () => {
  it('(async signer) can create a 1-to-1 Transaction', async () => {
    const txb = new bitcoin.TransactionBuilder()

    // create an async signer
    const asyncSigner = new AsyncSigner(
      bitcoin.ECPair.fromWIF('L1uyy5qTuGrVXrmrsvHWHgVzW9kKdrp27wBC7Vs6nZDTF2BRUVwy')
        .privateKey
    );
    asyncSigner.dump();

    txb.setVersion(1)
    txb.addInput('61d520ccb74288c96bc1a2b20ea1c0d5a704776dd0164a396efec3ea7040349d', 0) // Alice's previous transaction output, has 15000 satoshis
    txb.addOutput('1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP', 12000)
    // (in)15000 - (out)12000 = (fee)3000, this is the miner fee

    await txb.signAsync({
      prevOutScriptType: 'p2pkh',
      vin: 0,
      keyPair: asyncSigner 
    });

    // prepare for broadcast to the Bitcoin network, see "can broadcast a Transaction" below
    assert.strictEqual(txb.build().toHex(), '01000000019d344070eac3fe6e394a16d06d7704a7d5c0a10eb2a2c16bc98842b7cc20d561000000006b48304502210088828c0bdfcdca68d8ae0caeb6ec62cd3fd5f9b2191848edae33feb533df35d302202e0beadd35e17e7f83a733f5277028a9b453d525553e3f5d2d7a7aa8010a81d60121029f50f51d63b345039a290c94bffd3180c99ed659ff6ea6b1242bca47eb93b59fffffffff01e02e0000000000001976a91406afd46bcdfd22ef94ac122aa11f241244a37ecc88ac00000000')
  })

  it('can create a 1-to-1 Transaction', () => {
    const alice = bitcoin.ECPair.fromWIF('L1uyy5qTuGrVXrmrsvHWHgVzW9kKdrp27wBC7Vs6nZDTF2BRUVwy')
    const txb = new bitcoin.TransactionBuilder()

    txb.setVersion(1)
    txb.addInput('61d520ccb74288c96bc1a2b20ea1c0d5a704776dd0164a396efec3ea7040349d', 0) // Alice's previous transaction output, has 15000 satoshis
    txb.addOutput('1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP', 12000)
    // (in)15000 - (out)12000 = (fee)3000, this is the miner fee

    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 0,
      keyPair: alice
    })

    // prepare for broadcast to the Bitcoin network, see "can broadcast a Transaction" below
    assert.strictEqual(txb.build().toHex(), '01000000019d344070eac3fe6e394a16d06d7704a7d5c0a10eb2a2c16bc98842b7cc20d561000000006b48304502210088828c0bdfcdca68d8ae0caeb6ec62cd3fd5f9b2191848edae33feb533df35d302202e0beadd35e17e7f83a733f5277028a9b453d525553e3f5d2d7a7aa8010a81d60121029f50f51d63b345039a290c94bffd3180c99ed659ff6ea6b1242bca47eb93b59fffffffff01e02e0000000000001976a91406afd46bcdfd22ef94ac122aa11f241244a37ecc88ac00000000')
  })

  it('can create a 2-to-2 Transaction', () => {
    const alice = bitcoin.ECPair.fromWIF('L1Knwj9W3qK3qMKdTvmg3VfzUs3ij2LETTFhxza9LfD5dngnoLG1')
    const bob = bitcoin.ECPair.fromWIF('KwcN2pT3wnRAurhy7qMczzbkpY5nXMW2ubh696UBc1bcwctTx26z')

    const txb = new bitcoin.TransactionBuilder()
    txb.setVersion(1)
    txb.addInput('b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c', 6) // Alice's previous transaction output, has 200000 satoshis
    txb.addInput('7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504ded97730', 0) // Bob's previous transaction output, has 300000 satoshis
    txb.addOutput('1CUNEBjYrCn2y1SdiUMohaKUi4wpP326Lb', 180000)
    txb.addOutput('1JtK9CQw1syfWj1WtFMWomrYdV3W2tWBF9', 170000)
    // (in)(200000 + 300000) - (out)(180000 + 170000) = (fee)150000, this is the miner fee

    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 1,
      keyPair: bob
    }) // Bob signs his input, which was the second input (1th)
    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 0,
      keyPair: alice
    }) // Alice signs her input, which was the first input (0th)

    // prepare for broadcast to the Bitcoin network, see "can broadcast a Transaction" below
    assert.strictEqual(txb.build().toHex(), '01000000024c94e48a870b85f41228d33cf25213dfcc8dd796e7211ed6b1f9a014809dbbb5060000006a473044022041450c258ce7cac7da97316bf2ea1ce66d88967c4df94f3e91f4c2a30f5d08cb02203674d516e6bb2b0afd084c3551614bd9cec3c2945231245e891b145f2d6951f0012103e05ce435e462ec503143305feb6c00e06a3ad52fbf939e85c65f3a765bb7baacffffffff3077d9de049574c3af9bc9c09a7c9db80f2d94caaf63988c9166249b955e867d000000006b483045022100aeb5f1332c79c446d3f906e4499b2e678500580a3f90329edf1ba502eec9402e022072c8b863f8c8d6c26f4c691ac9a6610aa4200edc697306648ee844cfbc089d7a012103df7940ee7cddd2f97763f67e1fb13488da3fbdd7f9c68ec5ef0864074745a289ffffffff0220bf0200000000001976a9147dd65592d0ab2fe0d0257d571abf032cd9db93dc88ac10980200000000001976a914c42e7ef92fdb603af844d064faad95db9bcdfd3d88ac00000000')
  })

  it('can create (and broadcast via 3PBP) a typical Transaction', async () => {
    const alice1 = bitcoin.ECPair.makeRandom({ network: regtest })
    const alice2 = bitcoin.ECPair.makeRandom({ network: regtest })
    const aliceChange = bitcoin.ECPair.makeRandom({ network: regtest, rng: rng })

    const alice1pkh = bitcoin.payments.p2pkh({ pubkey: alice1.publicKey, network: regtest })
    const alice2pkh = bitcoin.payments.p2pkh({ pubkey: alice2.publicKey, network: regtest })
    const aliceCpkh = bitcoin.payments.p2pkh({ pubkey: aliceChange.publicKey, network: regtest })

    // give Alice 2 unspent outputs
    const unspent0 = await regtestUtils.faucet(alice1pkh.address, 5e4)

    const unspent1 = await regtestUtils.faucet(alice2pkh.address, 7e4)

    const txb = new bitcoin.TransactionBuilder(regtest)
    txb.addInput(unspent0.txId, unspent0.vout) // alice1 unspent
    txb.addInput(unspent1.txId, unspent1.vout) // alice2 unspent
    txb.addOutput('mwCwTceJvYV27KXBc3NJZys6CjsgsoeHmf', 8e4) // the actual "spend"
    txb.addOutput(aliceCpkh.address, 1e4) // Alice's change
    // (in)(5e4 + 7e4) - (out)(8e4 + 1e4) = (fee)3e4 = 30000, this is the miner fee

    // Alice signs each input with the respective private keys
    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 0,
      keyPair: alice1
    })
    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 1,
      keyPair: alice2
    })

    // build and broadcast our RegTest network
    await regtestUtils.broadcast(txb.build().toHex())
    // to build and broadcast to the actual Bitcoin network, see https://github.com/bitcoinjs/bitcoinjs-lib/issues/839
  })

  it('can create (and broadcast via 3PBP) a Transaction with an OP_RETURN output', async () => {
    const keyPair = bitcoin.ECPair.makeRandom({ network: regtest })
    const p2pkh = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: regtest })

    const unspent = await regtestUtils.faucet(p2pkh.address, 2e5)

    const txb = new bitcoin.TransactionBuilder(regtest)
    const data = Buffer.from('bitcoinjs-lib', 'utf8')
    const embed = bitcoin.payments.embed({ data: [data] })
    txb.addInput(unspent.txId, unspent.vout)
    txb.addOutput(embed.output, 1000)
    txb.addOutput(regtestUtils.RANDOM_ADDRESS, 1e5)
    txb.sign({
      prevOutScriptType: 'p2pkh',
      vin: 0,
      keyPair,
    })

    // build and broadcast to the RegTest network
    await regtestUtils.broadcast(txb.build().toHex())
  })

  it('can create (and broadcast via 3PBP) a Transaction, w/ a P2SH(P2MS(2 of 4)) (multisig) input', async () => {
    const keyPairs = [
      bitcoin.ECPair.makeRandom({ network: regtest }),
      bitcoin.ECPair.makeRandom({ network: regtest }),
      bitcoin.ECPair.makeRandom({ network: regtest }),
      bitcoin.ECPair.makeRandom({ network: regtest })
    ]
    const pubkeys = keyPairs.map(x => x.publicKey)
    const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys: pubkeys, network: regtest })
    const p2sh = bitcoin.payments.p2sh({ redeem: p2ms, network: regtest })

    const unspent = await regtestUtils.faucet(p2sh.address, 2e4)

    const txb = new bitcoin.TransactionBuilder(regtest)
    txb.addInput(unspent.txId, unspent.vout)
    txb.addOutput(regtestUtils.RANDOM_ADDRESS, 1e4)

    txb.sign({
      prevOutScriptType: 'p2sh-p2ms',
      vin: 0,
      keyPair: keyPairs[0],
      redeemScript: p2sh.redeem.output,
    })
    txb.sign({
      prevOutScriptType: 'p2sh-p2ms',
      vin: 0,
      keyPair: keyPairs[2],
      redeemScript: p2sh.redeem.output,
    })
    const tx = txb.build()

    // build and broadcast to the Bitcoin RegTest network
    await regtestUtils.broadcast(tx.toHex())

    await regtestUtils.verify({
      txId: tx.getId(),
      address: regtestUtils.RANDOM_ADDRESS,
      vout: 0,
      value: 1e4
    })
  })

  it('can create (and broadcast via 3PBP) a Transaction, w/ a P2SH(P2WPKH) input', async () => {
    const keyPair = bitcoin.ECPair.makeRandom({ network: regtest })
    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: regtest })
    const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network: regtest })

    const unspent = await regtestUtils.faucet(p2sh.address, 5e4)

    const txb = new bitcoin.TransactionBuilder(regtest)
    txb.addInput(unspent.txId, unspent.vout)
    txb.addOutput(regtestUtils.RANDOM_ADDRESS, 2e4)
    txb.sign({
      prevOutScriptType: 'p2sh-p2wpkh',
      vin: 0,
      keyPair: keyPair,
      redeemScript: p2sh.redeem.output,
      witnessValue: unspent.value,
    })

    const tx = txb.build()

    // build and broadcast to the Bitcoin RegTest network
    await regtestUtils.broadcast(tx.toHex())

    await regtestUtils.verify({
      txId: tx.getId(),
      address: regtestUtils.RANDOM_ADDRESS,
      vout: 0,
      value: 2e4
    })
  })

  it('can create (and broadcast via 3PBP) a Transaction, w/ a P2WPKH input', async () => {
    const keyPair = bitcoin.ECPair.makeRandom({ network: regtest })
    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: regtest })

    const unspent = await regtestUtils.faucetComplex(p2wpkh.output, 5e4)

    // XXX: build the Transaction w/ a P2WPKH input
    const txb = new bitcoin.TransactionBuilder(regtest)
    txb.addInput(unspent.txId, unspent.vout, null, p2wpkh.output) // NOTE: provide the prevOutScript!
    txb.addOutput(regtestUtils.RANDOM_ADDRESS, 2e4)
    txb.sign({
      prevOutScriptType: 'p2wpkh',
      vin: 0,
      keyPair: keyPair,
      witnessValue: unspent.value,
    }) // NOTE: no redeem script
    const tx = txb.build()

    // build and broadcast (the P2WPKH transaction) to the Bitcoin RegTest network
    await regtestUtils.broadcast(tx.toHex())

    await regtestUtils.verify({
      txId: tx.getId(),
      address: regtestUtils.RANDOM_ADDRESS,
      vout: 0,
      value: 2e4
    })
  })

  it('can create (and broadcast via 3PBP) a Transaction, w/ a P2WSH(P2PK) input', async () => {
    const keyPair = bitcoin.ECPair.makeRandom({ network: regtest })
    const p2pk = bitcoin.payments.p2pk({ pubkey: keyPair.publicKey, network: regtest })
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2pk, network: regtest })

    const unspent = await regtestUtils.faucetComplex(p2wsh.output, 5e4)

    // XXX: build the Transaction w/ a P2WSH input
    const txb = new bitcoin.TransactionBuilder(regtest)
    txb.addInput(unspent.txId, unspent.vout, null, p2wsh.output) // NOTE: provide the prevOutScript!
    txb.addOutput(regtestUtils.RANDOM_ADDRESS, 2e4)
    txb.sign({
      prevOutScriptType: 'p2wsh-p2pk',
      vin: 0,
      keyPair: keyPair,
      witnessValue: 5e4,
      witnessScript: p2wsh.redeem.output,
    }) // NOTE: provide a witnessScript!
    const tx = txb.build()

    // build and broadcast (the P2WSH transaction) to the Bitcoin RegTest network
    await regtestUtils.broadcast(tx.toHex())

    await regtestUtils.verify({
      txId: tx.getId(),
      address: regtestUtils.RANDOM_ADDRESS,
      vout: 0,
      value: 2e4
    })
  })

  it('can create (and broadcast via 3PBP) a Transaction, w/ a P2SH(P2WSH(P2MS(3 of 4))) (SegWit multisig) input', async () => {
    const keyPairs = [
      bitcoin.ECPair.makeRandom({ network: regtest }),
      bitcoin.ECPair.makeRandom({ network: regtest }),
      bitcoin.ECPair.makeRandom({ network: regtest }),
      bitcoin.ECPair.makeRandom({ network: regtest })
    ]
    const pubkeys = keyPairs.map(x => x.publicKey)

    const p2ms = bitcoin.payments.p2ms({ m: 3, pubkeys, network: regtest })
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network: regtest })
    const p2sh = bitcoin.payments.p2sh({ redeem: p2wsh, network: regtest })

    const unspent = await regtestUtils.faucet(p2sh.address, 6e4)

    const txb = new bitcoin.TransactionBuilder(regtest)
    txb.addInput(unspent.txId, unspent.vout, null, p2sh.output)
    txb.addOutput(regtestUtils.RANDOM_ADDRESS, 3e4)
    txb.sign({
      prevOutScriptType: 'p2sh-p2wsh-p2ms',
      vin: 0,
      keyPair: keyPairs[0],
      redeemScript: p2sh.redeem.output,
      witnessValue: unspent.value,
      witnessScript: p2wsh.redeem.output,
    })
    txb.sign({
      prevOutScriptType: 'p2sh-p2wsh-p2ms',
      vin: 0,
      keyPair: keyPairs[2],
      redeemScript: p2sh.redeem.output,
      witnessValue: unspent.value,
      witnessScript: p2wsh.redeem.output,
    })
    txb.sign({
      prevOutScriptType: 'p2sh-p2wsh-p2ms',
      vin: 0,
      keyPair: keyPairs[3],
      redeemScript: p2sh.redeem.output,
      witnessValue: unspent.value,
      witnessScript: p2wsh.redeem.output,
    })

    const tx = txb.build()

    // build and broadcast to the Bitcoin RegTest network
    await regtestUtils.broadcast(tx.toHex())

    await regtestUtils.verify({
      txId: tx.getId(),
      address: regtestUtils.RANDOM_ADDRESS,
      vout: 0,
      value: 3e4
    })
  })

  it('can verify Transaction (P2PKH) signatures', () => {
    const txHex = '010000000321c5f7e7bc98b3feda84aad36a5c99a02bcb8823a2f3eccbcd5da209698b5c20000000006b48304502210099e021772830207cf7c55b69948d3b16b4dcbf1f55a9cd80ebf8221a169735f9022064d33f11d62cd28240b3862afc0b901adc9f231c7124dd19bdb30367b61964c50121032b4c06c06c3ec0b7fa29519dfa5aae193ee2cc35ca127f29f14ec605d62fb63dffffffff8a75ce85441ddb3f342708ee33cc8ed418b07d9ba9e0e7c4e1cccfe9f52d8a88000000006946304302207916c23dae212c95a920423902fa44e939fb3d542f4478a7b46e9cde53705800021f0d74e9504146e404c1b8f9cba4dff2d4782e3075491c9ed07ce4a7d1c4461a01210216c92abe433106491bdeb4a261226f20f5a4ac86220cc6e37655aac6bf3c1f2affffffffdfef93f69fe32e944fad79fa8f882b3a155d80383252348caba1a77a5abbf7ef000000006b483045022100faa6e9ca289b46c64764a624c59ac30d9abcf1d4a04c4de9089e67cbe0d300a502206930afa683f6807502de5c2431bf9a1fd333c8a2910a76304df0f3d23d83443f0121039e05da8b8ea4f9868ecebb25998c7701542986233f4401799551fbecf316b18fffffffff01ff4b0000000000001976a9146c86476d1d85cd60116cd122a274e6a570a5a35c88acc96d0700'
    const keyPairs = [
      '032b4c06c06c3ec0b7fa29519dfa5aae193ee2cc35ca127f29f14ec605d62fb63d',
      '0216c92abe433106491bdeb4a261226f20f5a4ac86220cc6e37655aac6bf3c1f2a',
      '039e05da8b8ea4f9868ecebb25998c7701542986233f4401799551fbecf316b18f'
    ].map(q => { return bitcoin.ECPair.fromPublicKey(Buffer.from(q, 'hex')) })

    const tx = bitcoin.Transaction.fromHex(txHex)

    tx.ins.forEach((input, i) => {
      const keyPair = keyPairs[i]
      const p2pkh = bitcoin.payments.p2pkh({
        pubkey: keyPair.publicKey,
        input: input.script
      })

      const ss = bitcoin.script.signature.decode(p2pkh.signature)
      const hash = tx.hashForSignature(i, p2pkh.output, ss.hashType)

      assert.strictEqual(keyPair.verify(hash, ss.signature), true)
    })
  })

  it('can verify Transaction (P2SH(P2WPKH)) signatures', () => {
    const utxos = {
      'f72d1d83ac40fcedd01415751556a905844ab5f44bbb7728565ebb91b1590109:0': {
        value: 50000
      }
    }

    const txHex = '02000000000101090159b191bb5e562877bb4bf4b54a8405a95615751514d0edfc40ac831d2df7000000001716001435a179e5516947a39ae9c8a25e9fe62c0fc598edffffffff01204e0000000000001976a91431d43308d3c886d53e9ae8a45728370571ff456988ac0247304402206ec41f685b997a51f325b07ee852e82a535f6b52ef54485cc133e05168aa052a022070bafa86108acb51c77b2b259ae8fb7fd1efa10fef804fcfe9b13c2db719acf5012103fb03e9d0a9af86cbed94225dbb8bb70f6b82109bce0a61ddcf41dab6cbb4871100000000'
    const tx = bitcoin.Transaction.fromHex(txHex)

    tx.ins.forEach((input, i) => {
      const txId = Buffer.from(input.hash).reverse().toString('hex')
      const utxo = utxos[`${txId}:${i}`]
      if (!utxo) throw new Error('Missing utxo')

      const p2sh = bitcoin.payments.p2sh({
        input: input.script,
        witness: input.witness
      })
      const p2wpkh = bitcoin.payments.p2wpkh(p2sh.redeem)
      const p2pkh = bitcoin.payments.p2pkh({ pubkey: p2wpkh.pubkey }) // because P2WPKH is annoying

      const ss = bitcoin.script.signature.decode(p2wpkh.signature)
      const hash = tx.hashForWitnessV0(i, p2pkh.output, utxo.value, ss.hashType)
      const keyPair = bitcoin.ECPair.fromPublicKey(p2wpkh.pubkey) // aka, cQ3EtF4mApRcogNGSeyPTKbmfxxn3Yfb1wecfKSws9a8bnYuxoAk

      assert.strictEqual(keyPair.verify(hash, ss.signature), true)
    })
  })
})

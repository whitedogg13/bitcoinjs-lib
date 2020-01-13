import * as assert from 'assert';
// import * as bip32 from 'bip32';
import { describe, it } from 'mocha';
import * as bitcoin from '../..';
import { Signer, SignerAsync } from '../..';
import { regtestUtils } from './_regtest';
// const rng = require('randombytes');
const regtest = regtestUtils.network;
const { ECPair, TransactionBuilder } = bitcoin;

function createSignerAsync(signer: Signer): SignerAsync {
  async function sign(hash: Buffer, lowR?: boolean): Promise<Buffer> {
    return Promise.resolve(signer.sign(hash, lowR));
  }

  return {
    sign,
    network: signer.network,
    publicKey: signer.publicKey,
  };
}

describe('async-signer', () => {
  it('supports the alternative abstract interface { publicKey, sign }', async () => {
    const asyncKeyPair = createSignerAsync({
      publicKey: ECPair.makeRandom({
        rng: (): Buffer => {
          return Buffer.alloc(32, 1);
        },
      }).publicKey,
      sign: (): Buffer => {
        return Buffer.alloc(64, 0x5f);
      },
    });

    const txb = new TransactionBuilder();
    txb.setVersion(1);
    txb.addInput(
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      1,
    );
    txb.addOutput('1111111111111111111114oLvT2', 100000);

    await txb.signAsync({
      prevOutScriptType: 'p2pkh',
      vin: 0,
      keyPair: asyncKeyPair,
    });

    assert.strictEqual(
      txb.build().toHex(),
      '0100000001ffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
        'ffffffff010000006a47304402205f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f' +
        '5f5f5f5f5f5f5f5f5f5f5f5f5f02205f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f' +
        '5f5f5f5f5f5f5f5f5f5f5f5f5f5f0121031b84c5567b126440995d3ed5aaba0565' +
        'd71e1834604819ff9c17f5e9d5dd078fffffffff01a0860100000000001976a914' +
        '000000000000000000000000000000000000000088ac00000000',
    );
  });

  it('can create (and broadcast via 3PBP) a typical Transaction', async () => {
    // these are { payment: Payment; keys: ECPair[] }
    const alice1 = createPayment('p2pkh');
    const alice2 = createPayment('p2pkh');

    // give Alice 2 unspent outputs
    const inputData1 = await getInputData(
      5e4,
      alice1.payment,
      false,
      'noredeem',
    );
    const inputData2 = await getInputData(
      7e4,
      alice2.payment,
      false,
      'noredeem',
    );
    {
      const {
        hash, // string of txid or Buffer of tx hash. (txid and hash are reverse order)
        index, // the output index of the txo you are spending
        nonWitnessUtxo, // the full previous transaction as a Buffer
      } = inputData1;
      assert.deepStrictEqual({ hash, index, nonWitnessUtxo }, inputData1);
    }

    // network is only needed if you pass an address to addOutput
    // using script (Buffer of scriptPubkey) instead will avoid needed network.
    const psbt = new bitcoin.Psbt({ network: regtest })
      .addInput(inputData1) // alice1 unspent
      .addInput(inputData2) // alice2 unspent
      .addOutput({
        address: 'mwCwTceJvYV27KXBc3NJZys6CjsgsoeHmf',
        value: 8e4,
      }) // the actual "spend"
      .addOutput({
        address: alice2.payment.address, // OR script, which is a Buffer.
        value: 1e4,
      }); // Alice's change
    // (in)(5e4 + 7e4) - (out)(8e4 + 1e4) = (fee)3e4 = 30000, this is the miner fee

    // Let's show a new feature with PSBT.
    // We can have multiple signers sign in parrallel and combine them.
    // (this is not necessary, but a nice feature)

    // encode to send out to the signers
    const psbtBaseText = psbt.toBase64();

    // each signer imports
    const signer1 = bitcoin.Psbt.fromBase64(psbtBaseText);
    const signer2 = bitcoin.Psbt.fromBase64(psbtBaseText);

    // Alice signs each input with the respective private keys
    // signInput and signInputAsync are better
    // (They take the input index explicitly as the first arg)
    // signer1.signAllInputs(alice1.keys[0]);
    // signer2.signAllInputs(alice2.keys[0]);

    console.log('SignerAsync test');
    await signer1.signAllInputsAsync(createSignerAsync(alice1.keys[0]));
    await signer2.signAllInputsAsync(createSignerAsync(alice2.keys[0]));

    // If your signer object's sign method returns a promise, use the following
    // await signer2.signAllInputsAsync(alice2.keys[0])

    // encode to send back to combiner (signer 1 and 2 are not near each other)
    const s1text = signer1.toBase64();
    const s2text = signer2.toBase64();

    const final1 = bitcoin.Psbt.fromBase64(s1text);
    const final2 = bitcoin.Psbt.fromBase64(s2text);

    // final1.combine(final2) would give the exact same result
    psbt.combine(final1, final2);

    // Finalizer wants to check all signatures are valid before finalizing.
    // If the finalizer wants to check for specific pubkeys, the second arg
    // can be passed. See the first multisig example below.
    assert.strictEqual(psbt.validateSignaturesOfInput(0), true);
    assert.strictEqual(psbt.validateSignaturesOfInput(1), true);

    // This step it new. Since we separate the signing operation and
    // the creation of the scriptSig and witness stack, we are able to
    psbt.finalizeAllInputs();

    // build and broadcast our RegTest network
    await regtestUtils.broadcast(psbt.extractTransaction().toHex());
    // to build and broadcast to the actual Bitcoin network, see https://github.com/bitcoinjs/bitcoinjs-lib/issues/839
  });
});

function createPayment(_type: string, myKeys?: any[], network?: any): any {
  network = network || regtest;
  const splitType = _type.split('-').reverse();
  const isMultisig = splitType[0].slice(0, 4) === 'p2ms';
  const keys = myKeys || [];
  let m: number | undefined;
  if (isMultisig) {
    const match = splitType[0].match(/^p2ms\((\d+) of (\d+)\)$/);
    m = parseInt(match![1], 10);
    let n = parseInt(match![2], 10);
    if (keys.length > 0 && keys.length !== n) {
      throw new Error('Need n keys for multisig');
    }
    while (!myKeys && n > 1) {
      keys.push(bitcoin.ECPair.makeRandom({ network }));
      n--;
    }
  }
  if (!myKeys) keys.push(bitcoin.ECPair.makeRandom({ network }));

  let payment: any;
  splitType.forEach(type => {
    if (type.slice(0, 4) === 'p2ms') {
      payment = bitcoin.payments.p2ms({
        m,
        pubkeys: keys.map(key => key.publicKey).sort(),
        network,
      });
    } else if (['p2sh', 'p2wsh'].indexOf(type) > -1) {
      payment = (bitcoin.payments as any)[type]({
        redeem: payment,
        network,
      });
    } else {
      payment = (bitcoin.payments as any)[type]({
        pubkey: keys[0].publicKey,
        network,
      });
    }
  });

  return {
    payment,
    keys,
  };
}

function getWitnessUtxo(out: any): any {
  delete out.address;
  out.script = Buffer.from(out.script, 'hex');
  return out;
}

async function getInputData(
  amount: number,
  payment: any,
  isSegwit: boolean,
  redeemType: string,
): Promise<any> {
  const unspent = await regtestUtils.faucetComplex(payment.output, amount);
  const utx = await regtestUtils.fetch(unspent.txId);
  // for non segwit inputs, you must pass the full transaction buffer
  const nonWitnessUtxo = Buffer.from(utx.txHex, 'hex');
  // for segwit inputs, you only need the output script and value as an object.
  const witnessUtxo = getWitnessUtxo(utx.outs[unspent.vout]);
  const mixin = isSegwit ? { witnessUtxo } : { nonWitnessUtxo };
  const mixin2: any = {};
  switch (redeemType) {
    case 'p2sh':
      mixin2.redeemScript = payment.redeem.output;
      break;
    case 'p2wsh':
      mixin2.witnessScript = payment.redeem.output;
      break;
    case 'p2sh-p2wsh':
      mixin2.witnessScript = payment.redeem.redeem.output;
      mixin2.redeemScript = payment.redeem.output;
      break;
  }
  return {
    hash: unspent.txId,
    index: unspent.vout,
    ...mixin,
    ...mixin2,
  };
}

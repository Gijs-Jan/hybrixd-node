sendTransaction = function(properties) {
  if (properties.element !== null) {
    UItransform.txStart();
  }
  var p = {};
  p.asset = properties.asset;
  p.base  = properties.asset.split('.')[0];
  // block balance updating for transacting asset
  for (var j = 0; j < balance.asset.length; j++) {
    if (balance.asset[j] === p.asset) { balance.lasttx[j] = (new Date()).getTime(); }
  }
  p.amount = String(properties.amount);
  p.fee = String(assets.fees[p.asset]);
  p.source_address = String(properties.source).trim();
  p.target_address = String(properties.target).trim();
  p.element = properties.element;
  if (p.element !== null) {
    if (typeof p.element.getText === 'undefined') {
      p.balorig = $(p.element).attr('amount');  // running in browser
    } else {
      p.balorig = p.element.getText();  // running in cli4ioc
    }
    if (!isToken(p.asset)) {
      p.balance = fromInt( toInt(p.balorig,assets.fact[p.asset]).minus(toInt(p.amount,assets.fact[p.asset]).plus(toInt(p.fee,assets.fact[p.base]))),assets.fact[p.asset] );
    } else {
      p.balance = fromInt( toInt(p.balorig,assets.fact[p.asset]).minus(toInt(p.amount,assets.fact[p.asset])),assets.fact[p.asset] );
    }
    // instantly deduct hypothetical amount from balance in GUI
    UItransform.deductBalance(p.element, p.balance);
  } else {
    p.balance = 0;
    p.balorig = 0;
  }
  // send call to perform transaction
  if(typeof assets.fact[p.asset]!='undefined') {
    // prepare universal unspent query containing: source address / target address / amount / public key
    var unspent = 'a/'+p.asset+'/unspent/'+p.source_address+'/'+fromInt( toInt(p.amount,assets.fact[p.base]).plus(toInt(p.fee,assets.fact[p.base])),assets.fact[p.base] ).toString()+'/'+p.target_address+(typeof assets.keys[p.asset].publicKey==='undefined'?'':'/'+assets.keys[p.asset].publicKey);
    hybriddcall({r:unspent,z:1,pass:p},0, function(object,passdata) {
      if(typeof object.data!='undefined' && !object.err) {
        var unspent = object.data;
        var p = passdata;
        if(unspent!==null && typeof unspent==='object' && typeof unspent.change!=='undefined') { unspent.change = toInt(unspent.change,assets.fact[p.asset]); }
        storage.Get(assets.modehashes[ assets.mode[p.asset].split('.')[0] ]+'-LOCAL', function(dcode) {

          deterministic = activate( LZString.decompressFromEncodedURIComponent(dcode) );

          if(typeof deterministic!='object' || deterministic=={}) {
            // alert(lang.alertError,lang.modalSendTxErrorDcode);
            alert('Sorry, the transaction could not be generated! Deterministic code could not be initialized!');
            UItransform.txStop();
            UItransform.setBalance(p.element,p.balorig);
          } else {
            try {

              var onTransaction = function(transaction){
                if(typeof transaction!=='undefined') {
                  // DEBUG: logger(transaction);
                  hybriddcall({r:'a/'+this.p.asset+'/push/'+transaction,z:1,pass:this.p},null, function(object,passdata) {
                    var p = passdata;
                    if(typeof object.data!='undefined' && object.error==0) {
                      // again deduct real amount from balance in GUI (in case of refresh)
                      UItransform.deductBalance(p.element,p.balance);
                      setTimeout(function() {
                        UItransform.txStop();
                        UItransform.txHideModal();
                      },1000);
                      // push function returns TXID
                      logger('Node sent transaction ID: '+object.data);
                    } else {
                      UItransform.txStop();
                      UItransform.setBalance(p.element,p.balorig);
                      logger('Error sending transaction: '+object.data);
                      //alert(lang.alertError,lang.modalSendTxFailed+'\n'+object.data);
                      alert('<br>Sorry! The transaction did not work.<br><br><br>This is the error returned:<br><br>'+object.data+'<br>');
                    }
                  });
                } else {
                  UItransform.txStop();
                  UItransform.setBalance(this.p.element,this.p.balorig);
                  alert('The transaction deterministic calculation failed!  Please ask the Internet of Coins developers to fix this.');
                  logger('Deterministic calculation failed for '+this.p.asset+'!')
                }
              }.bind({p:p});

              // DEBUG: logger(JSON.stringify(assets));
              var transaction = deterministic.transaction({
                mode:assets.mode[p.asset].split('.')[1],
                symbol:p.asset,
                source:p.source_address,
                target:p.target_address,
                amount:toInt(p.amount,assets.fact[p.asset]),
                fee:toInt(p.fee,assets.fact[p.base]),
                factor:assets.fact[p.asset],
                contract:assets.cntr[p.asset],
                keys:assets.keys[p.asset],
                seed:assets.seed[p.asset],
                unspent:unspent
              },onTransaction);

              if(typeof transaction !== 'undefined'){// If a direct value is returned instead of using the callback then call the callback using that value
                onTransaction(transaction);
              }

            } catch(e) {
              UItransform.txStop();
              UItransform.setBalance(p.element,p.balorig);
              alert('Sorry, the transaction could not be generated!<br><br>'+e);
              logger('Error generating transaction for '+p.asset+': '+e)
            }
          }

        });
      } else {
        UItransform.txStop();
        alert('Sorry, the node did not send us data about unspents for making the transaction! Maybe there was a network problem. Please simply try again.');
      }
    });
  } else {
    UItransform.txStop();
    alert('Transaction failed. Assets were not yet completely initialized. Please try again in a moment.');
  }
}

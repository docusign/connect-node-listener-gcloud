/**
 * @file index.js -- GCloud functions in Node.js
 * This function receives a DocuSign Connect notification message
 * and enqueues it to a Pub/Sub topic.
 * 
 * Environment variables
 * BASIC_AUTH_NAME  -- used to enforce basic authentication for the function's url
 * BASIC_AUTH_PW
 * HMAC_1 -- the HMAC secret for HMAC signature 1. Can be omitted if HMAC not configured
 * TOPIC -- the Pub/Sub full topic name including the project name
 * 
 * 
 * HTTP Google Cloud Function.
 * See https://cloud.google.com/functions/docs/writing/
 * 
 * @param {Object} req Cloud Function request context.
 *                     More info: https://expressjs.com/en/api.html#req
 * @param {Object} res Cloud Function response context.
 *                     More info: https://expressjs.com/en/api.html#res
 */
// The exports attribute name (the function variable) MUST match 
// the GCloud Function name set in the Google Cloud Functions console

'use strict';

const crypto = require('crypto')
    , {PubSub} = require('@google-cloud/pubsub')
    ;

const debug = true;

const sleep = (milliseconds) => {
        return new Promise(resolve => setTimeout(resolve, milliseconds))
        }
    , debugLog = msg => {if (debug) {console.log(msg)}};

exports.http = async (req, res) => {
  const requestId = req.headers['function-execution-id'];

    function checkBasicAuth() {
        const name = process.env['BASIC_AUTH_NAME']
            , pw = process.env['BASIC_AUTH_PW']
            , authRaw0 = (req.headers && req.headers.authorization) || ''
            , authRaw = authRaw0.split(' ')[1]  || ''
            , authString = Buffer.from(authRaw, 'base64').toString()
            , authArray = authString.split(':')
            , authenticated = name == authArray[0] && pw == authArray[1]
            ;
        
        if (!authenticated && debug) {
            console.log  (`Authentication error. Authentication header: ${authRaw0} `)
        }
        return authenticated
    }

    debugLog(`Started!. Trace ID: ${requestId}`);
    // Check Basic Authentication 
    if (checkBasicAuth()) {
        debugLog("Authenticated!")
    } else {
        res.set('WWW-Authenticate', 'Basic realm="Connect Listener", charset="UTF-8"');
        res.status(401).send(`Unauthorized! Please include the BASIC AUTHENTICATION header.`)
        return // EARLY return
    }

    // Check HMAC and enqueue. Allow for test messages
    const test = (req.query && req.query.test) ? req.query.test : false
        , rawBody = req.body
        , hmac1 = process.env['HMAC_1']
        , hmacConfigured = hmac1;

    let body;
    debugLog(`content-type is ${req.headers['content-type']}`)
    
    if (req.headers['content-type'].toString().includes('text/xml')) {
        body = rawBody.toString('utf8')
    } else if (req.headers['content-type'].toString().includes('application/json')) {
        body = JSON.stringify(rawBody)
    }

    let hmacPassed;
    if (!test && hmacConfigured) {
        // Not a test:
        // Step 1. Check the HMAC
        // get the headers
        const authDigest = req.headers['x-authorization-digest']
            , accountIdHeader = req.headers['x-docusign-accountid']
            , hmacSig1 = req.headers['x-docusign-signature-1']
            ;
        hmacPassed = checkHmac(hmac1, body, authDigest, accountIdHeader, hmacSig1)
        if (!hmacPassed) {
            console.log(`${new Date().toUTCString()} HMAC did not pass!!`);
            res.status(401).send(`Unauthorized! HMAC did not pass!!`)
            return // EARLY return    
        }
        debugLog('HMAC passed!');
    } else {
        // hmac is not configured or a test message. HMAC is not checked for tests.
        hmacPassed = true
    }

    if (test || hmacPassed) {
        // Step 2. Store in queue
        let  error = await enqueue (body, test, req.headers['content-type'].toString());
        if (error) {
            // Wait 25 sec and then try again
            await sleep(25000);
            error = await enqueue (body, test, req.headers['content-type'].toString());
        }
        if (error) {
            console.log(`${new Date().toUTCString()} Enqueue error: ${error}`);
            res.status(400).send(`Problem! ${error}`)
        } else {
            // Success!
            res.status(200).send(`Enqueued ${requestId}`)
            if (test) {
                debugLog (`${new Date().toUTCString()} Enqueued a test notification: ${test}`)
            } else {
                debugLog (`${new Date().toUTCString()} Enqueued a notification`)
            }
        }
    } 
};

/**
* 
* @param {string} key1: The HMAC key for signature 1
* @param {string} rawBody: the request body of the notification POST 
* @param {string} authDigest: The HMAC signature algorithmn used
* @param {string} accountIdHeader: The account Id from the header
* @param {string} hmacSig1: The HMAC Signature number 1
* @returns {boolean} sigGood: Is the signatures good?
*/
function checkHmac (key1, rawBody, authDigest, accountIdHeader, hmacSig1) {    
    const authDigestExpected = 'HMACSHA256'
        , correctDigest = authDigestExpected === authDigest;
    if (!correctDigest) {return false}

    // The key is relative to the account. So if the 
    // same listener is used for Connect notifications from 
    // multiple accounts, use the accountIdHeader to look up
    // the secrets for the specific account.
    //
    // For this example, the key is supplied by the caller
    const hmacSig1Buffer = Buffer.from(hmacSig1);
    const computeHmacBuffer = Buffer.from(computeHmac(key1, rawBody))
    return crypto.timingSafeEqual(hmacSig1Buffer, computeHmacBuffer);
}

/**
* Compute a SHA256 HMAC on the <content> with the <key>
* The Base64 representation of the HMAC is then returned 
* @param {string} key 
* @param {*} content
* @returns {string} Base64 encoded SHA256 HMAC 
*/
function computeHmac(key, content) {
    const hmac = crypto.createHmac('sha256', key);
    hmac.write(content);
    hmac.end();
    return hmac.read().toString('base64');
}


/**
* The enqueue function adds the xml to the queue.
* If test is true then a test notification is sent. 
* See https://cloud.google.com/pubsub/docs/quickstart-client-libraries#publish_messages
* 
* @param {string} rawBody 
* @param {boolean||integer} test 
* @param {string} contentType
*/
async function enqueue(rawBody, test, contentType) {
    let error = false;
    if (test) {rawBody = ''}
    if (!test) {test = ''} // Always send a string

    const pubsub = new PubSub()
        , topicName = process.env['TOPIC']
        , data = JSON.stringify({test: test, contentType: contentType ,payload: rawBody});
    
    try {
        // Publish the message as a buffer
        const dataBuffer = Buffer.from(data)
            , messageId = await pubsub.topic(topicName).publish(dataBuffer);
        debugLog(`Enqueued! Message ${messageId}`);
    }
    catch (e) {
        error = e
    }
    return error
}
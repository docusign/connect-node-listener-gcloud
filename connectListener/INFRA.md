# GCP Infrastructure

To deploy the infrastructure in your GCP subscription, follow the instructions below.

## Prerequisites

Ensure you have [Serverless Framework](https://www.serverless.com/framework/docs/getting-started/) installed. You will also need to setup your GCP account with Serverless. To do so, please follow the instructions from [Serverless documenation](https://www.serverless.com/framework/docs/providers/google/guide/credentials/).

Note: In this example, we assume you're storing your key inside `~/serverless/gcp-example/.gcloud/keyfile.json`. Please change this path in `severless.yml` if using a different path.

## Steps:
 1) Define the following environment variables:
    - `LOCATION` : The GCP region to deploy the infra to. For example, `us-west1`. For a full list of regions, see [region list](https://cloud.google.com/about/locations).
    - `PROJECT_ID`: The ID of your GCP project.
    - `AUTH_NAME`: Your Connect authentication user name.
    - `BASIC_AUTH_PW`: Your Connection authentication password.
    - `HMAC`: HMAC to use for verification.
    - `QUEUE_NAME`: The queue name to use when creating pubsub
2) After the variables are set, you can simply do: `sls deploy` to deploy the infrastructure. 

After step 2 is compeleted, you wll be presented with your function endpoint:
```
.........................
Serverless: Done...
Service Information
service: gcp-example
project: xxxxx-308619
stage: dev
region: us-central1

Deployed functions
connect
  https://us-central1-xxxxx-308619.cloudfunctions.net/gcp-example-dev-connect

```


Refer to [Serverless docs](https://www.serverless.com/framework/docs/providers/google/) for more information.

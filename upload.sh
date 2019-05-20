(cd connectListener; gcloud functions deploy connectListener --runtime nodejs8 --env-vars-file ../.env.yaml)

# The environment variables are set via a YAML file.
# See https://cloud.google.com/functions/docs/env-var#setting_environment_variables

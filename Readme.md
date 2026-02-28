
# to get the kepair id of your program 
solana address -k target/deploy/calci-keypair.json


# to build the program
anchor build 

# to test our program we can 
anchor test 

# to deploy the program 
anchor deploy

# to run solana run local 
solana-test-validator

# to make sure program id is sam eis every where 
anchor keys sync 
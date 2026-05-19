# agent-eval

> Tools for evaluating the performance of agents on Primer-related tasks.

## Overview

This project creates a framework used for running experiments. In each
experiment, we establish treatments that are then used to setup the environment
for the agent before completing evaluations. These evaluations (evals) represent
a scenario where, given a prompt, we are evaluating how the agent behaves.

This framework allows us to test the effectiveness of different experimental
treatments on the evaluations we care about. In particular, we score results
based on:

- Correctness: how many of the tests does the agent output pass
- Cost: how much did the agent spend in API calls
- Latency: how long did the agent take to complete the evals

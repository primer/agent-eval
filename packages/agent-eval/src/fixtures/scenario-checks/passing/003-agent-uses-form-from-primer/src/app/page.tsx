import {FormControl, TextInput, Button} from '@primer/react'

export default function IndexPage() {
  return (
    <form>
      <FormControl>
        <FormControl.Label>Email</FormControl.Label>
        <TextInput type="email" />
      </FormControl>
      <Button type="submit">Sign up</Button>
    </form>
  )
}

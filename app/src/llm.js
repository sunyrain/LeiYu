import { generateMaterials } from './services/backend.js'

export async function generatePoemMaterials(userContext) {
  return generateMaterials(userContext)
}

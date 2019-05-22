export default abstract class CommHandler {
	abstract publishUnary(action: any, destination: any): void;
}
